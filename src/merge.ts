// Some places in places.json are also in locations.json (the synced data): same name, same spot. Shown
// as is, they stack two pins and two search results. Merging at load time, rather than editing the
// JSON, keeps the hourly sync from adding them back.

type Spot = { id: string; name: string; x: number; y: number; area?: string; real_life?: string; service?: string };

const SAME_SPOT = 1; // map units, as in scripts/validate-data.ts
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Locations plus the places that aren't already one. A duplicated place folds into the nearest location
 * of the same name: the location keeps its pin, category, screenshot and description and gains the
 * place's area, real-world counterpart and service. `merged` maps each folded place id to its location,
 * so old ?id= links and location pages still lead somewhere.
 */
export function mergePlaces<T extends Spot>(locations: T[], places: T[]) {
  const byName = new Map<string, T[]>();
  for (const l of locations) byName.set(norm(l.name), [...(byName.get(norm(l.name)) ?? []), l]);
  const out = new Map(locations.map((l) => [l.id, { ...l }]));
  const merged = new Map<string, string>();
  const kept: T[] = [];
  for (const p of places) {
    const dist = (l: T) => Math.hypot(l.x - p.x, l.y - p.y);
    const twin = (byName.get(norm(p.name)) ?? [])
      .filter((l) => dist(l) < SAME_SPOT)
      .sort((a, b) => dist(a) - dist(b))[0];
    if (!twin) {
      kept.push(p);
      continue;
    }
    const l = out.get(twin.id)!;
    l.area ||= p.area;
    l.real_life ||= p.real_life;
    l.service ||= p.service;
    merged.set(p.id, twin.id);
  }
  return { items: [...out.values(), ...kept], merged };
}
