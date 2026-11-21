/**
 * Checks the data contributors edit in public/. Runs in CI and with `pnpm validate`.
 * validateData() returns the problems so tests can call it on fixtures.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Entry = { id: string; kind: string; name: string; x: number; y: number; screenshot?: string | null };

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
}
