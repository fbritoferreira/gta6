/**
 * Checks the data contributors edit in public/. Runs in CI and with `pnpm validate`.
 * validateData() returns the problems so tests can call it on fixtures.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Entry = {
  id: string;
  kind: string;
  name: string;
  type?: string;
  x: number;
  y: number;
  screenshot?: string | null;
};

/** Closer than this (map units, about 32 game units) counts as the same spot. */
const SAME_SPOT = 1;
/** Names used more often than this in a file ("ATM", "Bar", "Prison Building") are generic, not duplicates. */
const GENERIC_NAME_USES = 3;

/**
 * Entries in one file with the same kind and the same specific name at the same spot.
 * Deliberately narrow: a location and its places.json entry, or one spot that is both a
 * landmark and a WAiNK scan, are intended pairs and are not reported.
 */
export function findDuplicates(list: Entry[]): string[] {
  const norm = (s: string | undefined) =>
    (s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const uses = new Map<string, number>();
  for (const e of list) uses.set(norm(e.name), (uses.get(norm(e.name)) ?? 0) + 1);
  const groups = new Map<string, Entry[]>();
  for (const e of list) {
    const name = norm(e.name);
    if ((uses.get(name) ?? 0) > GENERIC_NAME_USES) continue;
    const key = `${e.kind}|${name}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const found: string[] = [];
  for (const group of groups.values())
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i], group[j]];
        if (Math.hypot(a.x - b.x, a.y - b.y) < SAME_SPOT) found.push(`${a.id} and ${b.id} ("${a.name}")`);
      }
  return found;
}

/** Pairs at the very same coordinates, give or take rounding. */
const EXACT_SPOT = 0.05;

/**
 * Possible duplicates for a person to check, not errors: in one file and category, the same name
 * (generic ones too) within SAME_SPOT, or any two entries at the very same coordinates. Some are real
 * pairs (two arcade machines side by side), so they are reported, not rejected. Location and place
 * pairs are left out: src/merge.ts folds those together when the map loads.
 */
export function possibleDuplicates(list: Entry[]): string[] {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const byKind = new Map<string, Entry[]>();
  for (const e of list) {
    if (!byKind.has(e.kind)) byKind.set(e.kind, []);
    byKind.get(e.kind)!.push(e);
  }
  const found: string[] = [];
  for (const group of byKind.values())
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i], group[j]];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < EXACT_SPOT || (d < SAME_SPOT && norm(a.name) === norm(b.name)))
          found.push(`${a.id} and ${b.id}, ${d.toFixed(2)} apart ("${a.name}" / "${b.name}")`);
      }
  return found;
}

export function validateData(root: string): string[] {
  const read = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), "utf8")) as T;
  const problems: string[] = [];
  const report = (title: string, items: string[]) => {
    if (items.length) problems.push(`${title}:\n${items.map((i) => `  ${i}`).join("\n")}`);
  };

  let categories: { kinds: { key: string }[] }, locations: Entry[], places: Entry[], pinIndex: string[];
  try {
    categories = read("data/categories.json");
    locations = read("data/locations.json");
    places = read("data/places.json");
    pinIndex = read("icons/pins/index.json");
    for (const f of readdirSync(join(root, "data"))) if (f.endsWith(".json")) read(`data/${f}`);
  } catch (err) {
    return [`A JSON file doesn't parse: ${String(err)}`];
  }
  const entries = [...locations, ...places];

  report(
    "Screenshots that don't exist",
    locations.flatMap((l) => (l.screenshot && !existsSync(join(root, l.screenshot)) ? [l.screenshot] : [])),
  );

  // "other" is the sync's fallback for a category it doesn't know; a location whose id type is usually
  // filed elsewhere (a card-* id) was almost certainly misfiled, and wouldn't count toward that progress.
  const typeOf = (id: string) => id.replace(/-\d+$/, "");
  const tally = new Map<string, Map<string, number>>();
  for (const l of locations) {
    const t = tally.get(typeOf(l.id)) ?? new Map<string, number>();
    tally.set(typeOf(l.id), t.set(l.kind, (t.get(l.kind) ?? 0) + 1));
  }
  const usual = (id: string) => [...(tally.get(typeOf(id)) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
  report(
    'Filed as "other" though their id type usually isn\'t',
    locations
      .filter((l) => l.kind === "other" && usual(l.id) !== "other")
      .map((l) => `${l.id} (usually ${usual(l.id)})`),
  );

  // data/removed.json lists ids taken out on purpose; the data sync skips them, so they must stay out.
  const removedPath = join(root, "data/removed.json");
  const removed = existsSync(removedPath) ? read<{ id: string; reason: string }[]>("data/removed.json") : [];
  report(
    "Removed ids (data/removed.json) that are back in the data",
    entries.filter((e) => removed.some((r) => r.id === e.id)).map((e) => e.id),
  );
  report(
    "Entries in data/removed.json without an id and a reason",
    removed.filter((r) => !r.id || !r.reason).map((r) => JSON.stringify(r)),
  );

  // The sync falls back to the gtabase category slug ("card-ed-comics") for a type it has no label for;
  // that shows as is in popups and search.
  report(
    "Types that are slugs, not labels",
    locations.filter((l) => l.type && /^[a-z0-9]+(-[a-z0-9]+)+$/.test(l.type)).map((l) => `${l.id} ("${l.type}")`),
  );

  // A place's same_as names the location it is (src/merge.ts folds them together).
  const locationIds = new Set(locations.map((l) => l.id));
  report(
    "Places whose same_as isn't a location id",
    (places as (Entry & { same_as?: string })[])
      .filter((e) => e.same_as && !locationIds.has(e.same_as))
      .map((e) => `${e.id} (same_as ${e.same_as})`),
  );

  // Stray spaces break exact-name matches (search ranking, duplicate checks) and show in titles.
  report(
    "Names with spaces at either end",
    entries.filter((e) => e.name !== e.name?.trim()).map((e) => `${e.id} ("${e.name}")`),
  );

  // Files nothing points at are dead weight on every clone and in assets.json.
  const shown = new Set(locations.map((l) => l.screenshot));
  report(
    "Screenshot files no location uses",
    readdirSync(join(root, "screenshots"))
      .filter((f) => !f.startsWith("."))
      .map((f) => `screenshots/${f}`)
      .filter((f) => !shown.has(f)),
  );

  // A leading "/" resolves from the domain root, so the image breaks on GitHub Pages (served under /<repo>/).
  report(
    "Screenshots not written as screenshots/<file> (no leading /)",
    locations.flatMap((l) => (l.screenshot && !l.screenshot.startsWith("screenshots/") ? [l.screenshot] : [])),
  );

  const kinds = new Set(categories.kinds.map((k) => k.key));
  report(
    "Kinds missing from data/categories.json",
    [...new Set(entries.map((e) => e.kind))].filter((k) => !kinds.has(k)),
  );

  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const { id } of entries) (seen.has(id) ? dupes : seen).add(id);
  report("Duplicate ids", [...dupes]);
  report(
    "Entries missing a field (id, kind, name, x, y)",
    entries.flatMap((e, i) =>
      [e.id, e.kind, e.name].every((v) => typeof v === "string" && v) && [e.x, e.y].every(Number.isFinite)
        ? []
        : [e.id ?? `entry ${i}`],
    ),
  );
  report("The same location entered twice (same kind, name and spot)", [
    ...findDuplicates(locations),
    ...findDuplicates(places),
  ]);

  const pinFiles = new Set(
    readdirSync(join(root, "icons/pins"))
      .filter((f) => f.endsWith(".webp"))
      .map((f) => f.slice(0, -5)),
  );
  report(
    "Listed in icons/pins/index.json but no .webp file",
    pinIndex.filter((p) => !pinFiles.has(p)),
  );
  report(
    "Pin .webp files missing from icons/pins/index.json",
    [...pinFiles].filter((p) => !pinIndex.includes(p)),
  );

  return problems;
}

if (import.meta.main) {
  const problems = validateData("public");
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("Data OK");
  const read = (f: string) => JSON.parse(readFileSync(join("public/data", f), "utf8")) as Entry[];
  const maybe = [...possibleDuplicates(read("locations.json")), ...possibleDuplicates(read("places.json"))];
  if (maybe.length)
    console.log(
      `\nPossible duplicates to check (not errors; remove a real one and list it in data/removed.json):\n${maybe.map((m) => `  ${m}`).join("\n")}`,
    );
}
