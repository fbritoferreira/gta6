/**
 * Keeps the gta.wiki maps in step with the data: after each deploy to main, compares every page in
 * dist/wiki/index.json and the map image with what the wiki has, and only edits what changed.
 * Uses the MediaWiki Action API with a bot password (Special:BotPasswords):
 *
 *   WIKI_BOT_USER=Fbritoferreira@map-sync WIKI_BOT_PASSWORD=... node scripts/sync-wiki.ts
 *
 * Without the two variables it does nothing, so forks and local builds never touch the wiki.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const API = process.env.WIKI_API ?? "https://gta.wiki/api.php";
const EDIT_GAP_MS = 9000; // new accounts may make 8 edits a minute
const RATE_LIMIT_WAIT_MS = 65000;

type Index = { image: { wikiFile: string; path: string }; maps: { title: string; path: string }[] };
type ApiError = { code: string; info: string };

/** True when the wiki page holds the same JSON, ignoring formatting (the wiki re-indents it). */
export function sameJson(current: string | undefined, next: string): boolean {
  if (current === undefined) return false;
  try {
    return JSON.stringify(JSON.parse(current)) === JSON.stringify(JSON.parse(next));
  } catch {
    return false;
  }
}

/** A tiny API client that keeps the session cookies MediaWiki needs between login and edits. */
function client(api: string) {
  const cookies = new Map<string, string>();
  const call = async (params: Record<string, string>, body?: FormData) => {
    const url = body ? api : `${api}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
    if (body) for (const [k, v] of Object.entries({ format: "json", formatversion: "2", ...params })) body.set(k, v);
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      body,
      headers: { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "), "User-Agent": "open-gta6-map-sync" },
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    if (!res.ok) throw new Error(`${params.action}: HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown> & { error?: ApiError };
  };
  const post = (params: Record<string, string>, extra?: (f: FormData) => void) => {
    const f = new FormData();
    extra?.(f);
    return call(params, f);
  };
  return { call, post };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const user = process.env.WIKI_BOT_USER;
  const password = process.env.WIKI_BOT_PASSWORD;
  const dryRun = process.env.WIKI_DRY_RUN === "1"; // reads the public pages and reports, no login or edits
  if (!dryRun && (!user || !password)) {
    console.log("wiki sync: WIKI_BOT_USER / WIKI_BOT_PASSWORD not set, skipping");
    return;
  }
  const sha = (process.env.GITHUB_SHA ?? "local").slice(0, 7);
  const index = JSON.parse(readFileSync("dist/wiki/index.json", "utf8")) as Index;
  const { call, post } = client(API);

  let csrf = "";
  if (!dryRun) {
    const loginToken = (
      (await call({ action: "query", meta: "tokens", type: "login" })) as { query: { tokens: { logintoken: string } } }
    ).query.tokens.logintoken;
    const login = (await post({ action: "login", lgname: user!, lgpassword: password!, lgtoken: loginToken })) as {
      login?: { result: string; reason?: string };
    };
    if (login.login?.result !== "Success")
      throw new Error(`wiki login failed: ${login.login?.reason ?? login.login?.result ?? "no response"}`);
    csrf = ((await call({ action: "query", meta: "tokens" })) as { query: { tokens: { csrftoken: string } } }).query
      .tokens.csrftoken;
  }

  /** Retries once the rate limit window passes; other errors are returned to the caller. */
  const write = async (params: Record<string, string>, extra?: (f: FormData) => void) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await post({ ...params, token: csrf }, extra);
      if (r.error?.code !== "ratelimited") return r;
      await sleep(RATE_LIMIT_WAIT_MS);
    }
    throw new Error(`${params.title ?? params.filename}: still rate limited`);
  };

  let edited = 0;
  const skipped: string[] = [];
  for (const m of index.maps) {
    const next = readFileSync(`dist/wiki/${m.path}`, "utf8");
    const q = (await call({
      action: "query",
      prop: "revisions",
      titles: m.title,
      rvprop: "content",
      rvslots: "main",
    })) as {
      query: { pages: { missing?: boolean; revisions?: { slots: { main: { content: string } } }[] }[] };
    };
    const current = q.query.pages[0].revisions?.[0]?.slots.main.content;
    if (sameJson(current, next)) continue;
    if (dryRun) {
      console.log(`wiki sync (dry run): would ${current === undefined ? "create" : "update"} ${m.title}`);
      edited++;
      continue;
    }
    const r = await write({
      action: "edit",
      title: m.title,
      text: next,
      summary: `Sync from Open GTA 6 Map (${sha}); data CC BY 4.0`,
      bot: "1",
    });
    if (r.error) {
      // A title the wiki's spam filter blocks needs an admin; report it without failing the deploy.
      skipped.push(`${m.title}: ${r.error.code}`);
      continue;
    }
    edited++;
    console.log(`wiki sync: ${current === undefined ? "created" : "updated"} ${m.title}`);
    await sleep(EDIT_GAP_MS);
  }

  const image = readFileSync(`dist/wiki/${index.image.path}`);
  const localSha1 = createHash("sha1").update(image).digest("hex");
  const info = (await call({ action: "query", prop: "imageinfo", titles: index.image.wikiFile, iiprop: "sha1" })) as {
    query: { pages: { imageinfo?: { sha1: string }[] }[] };
  };
  if (info.query.pages[0].imageinfo?.[0]?.sha1 !== localSha1 && dryRun) {
    console.log(`wiki sync (dry run): would upload ${index.image.wikiFile}`);
    edited++;
  } else if (info.query.pages[0].imageinfo?.[0]?.sha1 !== localSha1) {
    const r = await write(
      {
        action: "upload",
        filename: index.image.wikiFile.replace(/^File:/, ""),
        comment: `Sync from Open GTA 6 Map (${sha})`,
        ignorewarnings: "1",
      },
      (f) => f.set("file", new Blob([image], { type: "image/jpeg" }), index.image.path),
    );
    if (r.error) throw new Error(`image upload: ${r.error.code} ${r.error.info}`);
    edited++;
    console.log(`wiki sync: uploaded ${index.image.wikiFile}`);
  }

  console.log(`wiki sync: ${edited} change(s), ${index.maps.length - edited - skipped.length} unchanged`);
  for (const s of skipped) console.warn(`wiki sync: skipped ${s}`);
}

if (import.meta.main) await main();
