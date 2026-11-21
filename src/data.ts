import { districtAt } from "./geo";
export type Kind = { key: string; name: string; colour: string; icon: string; group: string; pinnable: boolean };
export type Item = {
  id: string;
  kind: string;
  x: number;
  y: number;
  name: string;
  type?: string;
  description?: string;
  area?: string;
  real_life?: string;
  service?: string;
  screenshot?: string | null;
  /** Pin image slug in icons/pins/, or null to draw the category badge. */
  pin: string | null;
  /** The district whose outline contains it (data/districts.json), if any. */
  district?: string;
};
export type District = { name: string; x: number; y: number; rings: [number, number][][] };

const json = async <T>(path: string): Promise<T> => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
};

// Pins: hand-drawn map pins in icons/pins/<type>.webp, listed in icons/pins/index.json.
// A location's type is its id without the number (bank-001 is a bank). Types without their
// own pin borrow a close one; anything left uses the category badge.
const PIN_ALIASES: Record<string, string> = {
  comics: "magazine",
  "cafe-takeout": "street-food",
  "food-and-drink": "bar",
  "phone-store": "electronics",
  parachuting: "base-jump",
  "gang-compound": "gang-operation",
  "vehicle-mod-shop": "pay-n-spray",
};
const KIND_PINS: Record<string, string> = {
  card: "collectible-card",
  magazine: "magazine",
  bookswap: "book-swap",
  waink: "waink-curiosity",
  food: "bar",
  transport: "bus-stop",
  safehouse: "safehouse",
  fence: "fence",
};

const typeOf = (id: string) => id.replace(/-\d+$/, "");

/** For each id type, the category most of its locations are in (hidden-package-* is mostly "package"). */
export function usualKinds(items: { id: string; kind: string }[]): Map<string, string> {
  const tally = new Map<string, Map<string, number>>();
  for (const it of items) {
    const t = tally.get(typeOf(it.id)) ?? new Map<string, number>();
    t.set(it.kind, (t.get(it.kind) ?? 0) + 1);
    tally.set(typeOf(it.id), t);
  }
  return new Map([...tally].map(([type, t]) => [type, [...t].sort((a, b) => b[1] - a[1])[0][0]]));
}

/**
 * The pin slug for a location: its own type's pin, a close stand-in, its category's pin, or null.
 * A location filed under another category than its type usually is (a card with a hidden-package id)
 * gets its category's pin, so the pin matches what it is rather than how it was numbered.
 */
export function pinFor(
  it: { id: string; kind: string },
  pinNames: Set<string>,
  usual?: Map<string, string>,
): string | null {
  const type = typeOf(it.id);
  const want = PIN_ALIASES[type] ?? (type.startsWith("card-") ? "collectible-card" : type);
  const typeFits = !usual || usual.get(type) === undefined || usual.get(type) === it.kind;
  if (typeFits && pinNames.has(want)) return want;
  const fallback = KIND_PINS[it.kind];
  return fallback && pinNames.has(fallback) ? fallback : null;
}

export async function loadData() {
  const [cats, locations, places, districts, pinList] = await Promise.all([
    json<{ groups: string[]; kinds: Kind[] }>("data/categories.json"),
    json<Omit<Item, "pin">[]>("data/locations.json"),
    json<Omit<Item, "pin">[]>("data/places.json"),
    json<District[]>("data/districts.json"),
    json<string[]>("icons/pins/index.json").catch(() => []),
  ]);
  const catBy: Record<string, Kind> = Object.fromEntries(cats.kinds.map((k) => [k.key, k]));
  const pinNames = new Set(pinList);
  const known = [...locations, ...places].filter((it) => catBy[it.kind]);
  const usual = usualKinds(known);
  const items: Item[] = known.map((it) => ({
    ...it,
    pin: pinFor(it, pinNames, usual),
    district: districtAt(it.x, it.y, districts),
  }));

  const counts: Record<string, number> = {};
  const tally: Record<string, Record<string, number>> = {};
  for (const it of items) {
    counts[it.kind] = (counts[it.kind] ?? 0) + 1;
    if (it.pin) {
      const t = (tally[it.kind] ??= {});
      t[it.pin] = (t[it.pin] ?? 0) + 1;
    }
  }
  // The legend shows, for each category, the pin most of its items use.
  const kindPin: Record<string, string> = Object.fromEntries(
    Object.entries(tally).map(([k, t]) => [k, Object.entries(t).sort((a, b) => b[1] - a[1])[0][0]]),
  );

  const shownKinds = cats.kinds.filter((k) => counts[k.key]);
  return {
    groups: cats.groups.filter((g) => shownKinds.some((k) => k.group === g)),
    catBy,
    items,
    counts,
    kindPin,
    shownKinds,
    districts,
    defaultKinds: shownKinds.filter((k) => k.group !== "Places").map((k) => k.key),
  };
}
export type Data = Awaited<ReturnType<typeof loadData>>;
