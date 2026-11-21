// Search across everything a player might type: a location's name, what it is, its district or area,
// the real-world place it is based on, or its description. Results come back grouped: districts to
// zoom to, categories to show on their own, and locations ranked by how well their name matches.

export type Searchable = {
  id: string;
  kind: string;
  name: string;
  type?: string;
  area?: string;
  real_life?: string;
  description?: string;
  district?: string;
};

/** Lowercase, accents removed, punctuation to spaces: "Señora's" and "senoras" match. */
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Entry<T> = { it: T; name: string; text: string };

export function buildIndex<T extends Searchable>(items: T[], categoryName: (kind: string) => string) {
  return items.map((it): Entry<T> => ({
    it,
    name: normalize(it.name),
    text: normalize(
      [it.name, it.type, categoryName(it.kind), it.district, it.area, it.real_life, it.description].join(" "),
    ),
  }));
}

/** Lower is better: the name starts with the query, then a name word does, then the name has it, then anything else. */
function rank(name: string, query: string, words: string[]) {
  if (name.startsWith(query)) return 0;
  if (words.every((w) => name.split(" ").some((n) => n.startsWith(w)))) return 1;
  if (words.every((w) => name.includes(w))) return 2;
  return 3;
}

export type Results<T> = {
  districts: { name: string; count: number }[];
  categories: { kind: string; name: string; count: number }[];
  items: T[];
  more: number;
};

export function search<T extends Searchable>(
  index: Entry<T>[],
  rawQuery: string,
  districts: string[],
  categories: { kind: string; name: string }[],
  limit = 30,
): Results<T> {
  const query = normalize(rawQuery);
  const words = query.split(" ").filter(Boolean);
  if (!words.length || query.length < 2) return { districts: [], categories: [], items: [], more: 0 };

  const matches = index.filter((e) => words.every((w) => e.text.includes(w)));
  matches.sort((a, b) => rank(a.name, query, words) - rank(b.name, query, words) || a.name.length - b.name.length);

  const byDistrict = new Map<string, number>();
  for (const e of index) if (e.it.district) byDistrict.set(e.it.district, (byDistrict.get(e.it.district) ?? 0) + 1);
  const byKind = new Map<string, number>();
  for (const e of index) byKind.set(e.it.kind, (byKind.get(e.it.kind) ?? 0) + 1);
  const named = (name: string) => words.every((w) => normalize(name).includes(w));

  return {
    districts: districts.filter(named).map((name) => ({ name, count: byDistrict.get(name) ?? 0 })),
    categories: categories.filter((c) => named(c.name)).map((c) => ({ ...c, count: byKind.get(c.kind) ?? 0 })),
    items: matches.slice(0, limit).map((e) => e.it),
    more: Math.max(0, matches.length - limit),
  };
}
