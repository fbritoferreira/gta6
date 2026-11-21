// Some places in places.json are also in locations.json (the synced data): same name and spot, or the
// same category at the very same coordinates (the synced entry copied the place's position). Shown
// as is, they stack two pins and two search results. Merging at load time, rather than editing the
// JSON, keeps the hourly sync from adding them back.

type Spot = {
  id: string;
  kind?: string;
  name: string;
  type?: string;
  /** On a place: the id of the location it is, when the names don't show it ("Watkins Auto Parts" is Moses). */
  same_as?: string;
  x: number;
  y: number;
  area?: string;
  real_life?: string;
  service?: string;
  real_life_lat?: number;
  real_life_lng?: number;
  real_life_street_view_pano?: string;
};

const SAME_SPOT = 1; // map units, as in scripts/validate-data.ts
const EXACT = 0.05; // the same coordinates, give or take rounding: "Key Lento Marina" on top of "Marina"
const NEAR = 0.5; // close, and sharing a word: "Peacock Bay Marina" by a place called "Marina"
const words = (...s: (string | undefined)[]) =>
  new Set(
    norm(s.filter(Boolean).join(" "))
      .split(" ")
      .filter((w) => w.length > 2 && w !== "the" && w !== "and")
      .map((w) => w.replace(/s$/, "")),
  );
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Locations plus the places that aren't already one. A place folds into a location when it:
 *   1. names it (same_as),
 *   2. has the same name within SAME_SPOT,
 *   3. is in the same category at the same coordinates, or
 *   4. is in the same category within NEAR and shares a word ("Marina" by "Peacock Bay Marina").
 * The location keeps its pin, category, screenshot and description and gains the place's area (over its
 * own district-level one), real-world counterpart, coordinates and service. `merged` maps each folded
 * place id to its location, so old ?id= links and location pages still lead somewhere.
 */
export function mergePlaces<T extends Spot>(locations: T[], places: T[]) {
  const byName = new Map<string, T[]>();
  const byKind = new Map<string | undefined, T[]>();
  for (const l of locations) {
    const name = norm(l.name);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(l);
    if (!byKind.has(l.kind)) byKind.set(l.kind, []);
    byKind.get(l.kind)!.push(l);
  }
  const out = new Map(locations.map((l) => [l.id, { ...l }]));
  const merged = new Map<string, string>();
  const kept: T[] = [];
  for (const p of places) {
    const dist = (l: T) => Math.hypot(l.x - p.x, l.y - p.y);
    const said = p.same_as ? locations.find((l) => l.id === p.same_as) : undefined;
    const placeWords = words(p.name, p.service);
    const twin =
      said ??
      (byName.get(norm(p.name)) ?? []).filter((l) => dist(l) < SAME_SPOT).sort((a, b) => dist(a) - dist(b))[0] ??
      byKind.get(p.kind)?.find((l) => dist(l) < EXACT) ??
      byKind
        .get(p.kind)
        ?.filter((l) => dist(l) < NEAR && [...words(l.name, l.type)].some((w) => placeWords.has(w)))
        .sort((a, b) => dist(a) - dist(b))[0];
    if (!twin) {
      kept.push(p);
      continue;
    }
    const l = out.get(twin.id)!;
    l.area = p.area || l.area; // the place's area is finer ("Washington Beach, Vice Beach") than a district
    l.real_life ||= p.real_life;
    l.service ||= p.service;
    l.real_life_lat ??= p.real_life_lat;
    l.real_life_lng ??= p.real_life_lng;
    l.real_life_street_view_pano ||= p.real_life_street_view_pano;
    merged.set(p.id, twin.id);
  }
  // Places first: places.json changes only by hand, while the sync appends to locations.json, so the
  // list grows at the end and progress links (src/progress.ts) keep reading after a sync.
  return { items: [...kept, ...out.values()], merged };
}
