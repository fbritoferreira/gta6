/**
 * Writes a static page per location for search engines: dist/l/<id>/index.html, plus sitemap.xml and
 * robots.txt. Plain HTML and CSS, no JavaScript, each with "Open on the map" linking to /?id=<id>.
 *
 * Only locations worth a page get one: those with a description or screenshot, and places matched to
 * a real-world address. The rest would be a name and a category, which search engines rank poorly.
 * Runs as part of `pnpm build`, after the site itself is built.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { districtAt, toGame, type Outline } from "../src/geo.ts";

export type Entry = {
  service?: string;
  id: string;
  kind: string;
  x: number;
  y: number;
  name: string;
  type?: string;
  description?: string;
  screenshot?: string | null;
  area?: string;
  real_life?: string;
};
type Kind = { key: string; name: string; colour: string };

const NEARBY = 5;
const DESCRIPTION_MAX = 155;

/** One-of names for the Places categories, which are named in the plural. */
const PLACE_KIND: Record<string, string> = {
  safehouse: "Safehouse",
  shop: "Shop",
  food: "Food and drink",
  hotel: "Hotel",
  transport: "Transport",
  civic: "Public building",
  leisure: "Leisure",
  nature: "Natural feature",
  building: "Building",
};

/** What a location is, singular: its type, a place's service, or its category. */
export const what = (it: Entry & { service?: string }, kindName: string) =>
  it.type || it.service || PLACE_KIND[it.kind] || kindName;

/** The name, plus what it is unless the name already says (cards are named "<set> card: <player>"). */
const label = (it: Entry & { service?: string }, kindName: string) => {
  const w = what(it, kindName);
  return it.name.toLowerCase().includes(w.toLowerCase()) ? it.name : `${it.name} (${w})`;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Locations with something to say, and places matched to a real-world address. */
export const hasPage = (it: Entry) => !!(it.description || it.screenshot || it.real_life);

/** The search snippet: what and where, then the description, cut at a word near 155 characters. */
export function metaDescription(it: Entry, category: string, district: string) {
  const lead = `${it.type || category} in ${district}, Leonida.`;
  const rest = it.description ?? (it.real_life ? `Based on ${it.real_life}.` : "");
  const full = rest ? `${lead} ${rest}` : lead;
  if (full.length <= DESCRIPTION_MAX) return full;
  return `${full.slice(0, full.lastIndexOf(" ", DESCRIPTION_MAX - 1))}...`;
}

export function buildPage(
  it: Entry,
  kind: Kind,
  district: string,
  nearby: Entry[],
  siteUrl: string,
  kindName: (key: string) => string = () => kind.name,
  /** The screenshot's pixel size, so the page reserves its space before it loads (no layout shift). */
  shot?: { width: number; height: number },
) {
  const url = `${siteUrl}/l/${it.id}/`;
  const category = what(it, kind.name);
  const title = `${label(it, kind.name)}, ${district} | Open GTA 6 Map`;
  const image = it.screenshot ? `${siteUrl}/${it.screenshot}` : `${siteUrl}/og.jpg`;
  const { gx, gy } = toGame(it.x, it.y);
  const facts = [
    ["Category", kind.name],
    ["District", district],
    ...(it.area ? [["Area", it.area]] : []),
    ...(it.real_life ? [["Real-life counterpart", it.real_life]] : []),
    ["Game coordinates", `X ${gx.toLocaleString("en")}, Y ${gy.toLocaleString("en")}`],
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDescription(it, category, district))}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Open GTA 6 Map">
<meta property="og:title" content="${esc(`${label(it, kind.name)}, ${district}`)}">
<meta property="og:description" content="${esc(metaDescription(it, category, district))}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0F1D30">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='44' fill='%23FF5FA2'/><circle cx='50' cy='50' r='18' fill='%23fff'/></svg>">
<style>
:root{--gulf:#0F1D30;--deep:#091321;--bone:#F5EFE6;--sand:#F2D7A6;--haze:#8C9BB5;--teal:#3FE0D0;--line:rgba(245,239,230,.12)}
*{box-sizing:border-box}body{margin:0;background:var(--deep);color:var(--bone);font:400 16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:720px;margin:0 auto;padding:28px 18px 48px}a{color:var(--teal)}
.crumb{font-size:14px;color:var(--haze)}.crumb a{color:var(--haze)}
h1{font-size:30px;line-height:1.2;margin:10px 0 4px}.kind{color:var(--sand);margin:0 0 18px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;background:${kind.colour}}
img{display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--line);margin:0 0 18px;background:var(--gulf)}
.cta{display:inline-block;margin:6px 0 24px;padding:12px 20px;border-radius:999px;background:var(--bone);color:var(--gulf);font-weight:600;text-decoration:none}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0 0 24px}dt{color:var(--haze)}dd{margin:0}
h2{font-size:18px;margin:28px 0 8px;color:var(--sand)}ul{padding-left:20px}footer{margin-top:36px;font-size:13px;color:var(--haze)}
</style>
</head>
<body>
<main>
<p class="crumb"><a href="../../">Open GTA 6 Map</a> / ${esc(district)}</p>
<h1>${esc(it.name)}</h1>
<p class="kind"><span class="dot" aria-hidden="true"></span>${esc(category)} in ${esc(district)}</p>
${it.screenshot ? `<img src="../../${esc(it.screenshot)}"${shot ? ` width="${shot.width}" height="${shot.height}"` : ""} alt="${esc(`Where to find ${it.name}`)}" loading="lazy">` : ""}
${it.description ? `<p>${esc(it.description)}</p>` : ""}
<a class="cta" href="../../?id=${encodeURIComponent(it.id)}">Open on the map</a>
<dl>
${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("\n")}
</dl>
${
  nearby.length
    ? `<h2>Nearby</h2>\n<ul>\n${nearby.map((n) => `<li><a href="../${n.id}/">${esc(n.name)}</a> <span class="muted">${esc(what(n, kindName(n.kind)))}</span></li>`).join("\n")}\n</ul>`
    : ""
}
<footer>Fan-made map data, CC BY 4.0. Not affiliated with Rockstar Games or Take-Two Interactive.</footer>
</main>
</body>
</html>
`;
}

export function buildSitemap(ids: string[], siteUrl: string) {
  const urls = [`${siteUrl}/`, ...ids.map((id) => `${siteUrl}/l/${id}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;
}

if (import.meta.main) {
  const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? "fbritoferreira/gta6").split("/");
  const siteUrl = `https://${owner.toLowerCase()}.github.io/${repo}`;
  const kinds = new Map(read<{ kinds: Kind[] }>("public/data/categories.json").kinds.map((k) => [k.key, k]));
  const districts = read<Outline[]>("public/data/districts.json");
  const all = [...read<Entry[]>("public/data/locations.json"), ...read<Entry[]>("public/data/places.json")];
  const pages = all.filter((it) => hasPage(it) && kinds.has(it.kind) && /^[A-Za-z0-9-]+$/.test(it.id));

  for (const it of pages) {
    const nearby = pages
      .filter((o) => o !== it)
      .map((o) => ({ o, d: (o.x - it.x) ** 2 + (o.y - it.y) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, NEARBY)
      .map(({ o }) => o);
    const district = districtAt(it.x, it.y, districts) ?? "Leonida";
    const meta = it.screenshot ? await sharp(`public/${it.screenshot}`).metadata() : undefined;
    const shot = meta?.width && meta.height ? { width: meta.width, height: meta.height } : undefined;
    mkdirSync(`dist/l/${it.id}`, { recursive: true });
    writeFileSync(
      `dist/l/${it.id}/index.html`,
      buildPage(it, kinds.get(it.kind)!, district, nearby, siteUrl, (k) => kinds.get(k)?.name ?? k, shot),
    );
  }
  writeFileSync(
    "dist/sitemap.xml",
    buildSitemap(
      pages.map((p) => p.id),
      siteUrl,
    ),
  );
  writeFileSync("dist/robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
  console.log(`location pages: ${pages.length}, sitemap.xml, robots.txt`);
}
