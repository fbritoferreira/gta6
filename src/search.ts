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
function rank(name: string, query: string, words: string[], fuzzy: boolean) {
  if (name.startsWith(query)) return 0;
  if (words.every((w) => name.split(" ").some((n) => n.startsWith(w)))) return 1;
  if (words.every((w) => has(name, w, fuzzy))) return 2;
  return 3;
}

/** Edit distance between a and b, a swap of two neighbouring letters counting as one edit. Gives up
 * (returning max + 1) once it must exceed max. */
export function distance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j], before[j - 2] + 1);
    }
    if (Math.min(...row) > max) return max + 1;
    [before, prev] = [prev, row];
  }
  return prev[b.length];
}

/**
 * A query word that is in the text, or, when fuzzy, one or two typos away from the start of a word in it
 * ("hiden" finds "hidden", "wank" finds "waink"). Words under 4 letters must match exactly.
 */
function has(text: string, w: string, fuzzy: boolean) {
  if (text.includes(w)) return true;
  if (!fuzzy || w.length < 4) return false;
  const max = w.length < 7 ? 1 : 2;
  return text
    .split(" ")
    .some((t) => [-1, 0, 1].some((d) => w.length + d <= t.length && distance(w, t.slice(0, w.length + d), max) <= max));
}

export type Results<T> = {
  districts: { name: string; count: number }[];
  categories: { kind: string; name: string; count: number }[];
  items: T[];
  more: number;
  /** Nothing matched as typed, so these allow a typo or two. */
  fuzzy: boolean;
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
  if (!words.length || query.length < 2) return { districts: [], categories: [], items: [], more: 0, fuzzy: false };
  const exact = find(index, query, words, districts, categories, limit, false);
  return exact.districts.length || exact.categories.length || exact.items.length
    ? exact
    : find(index, query, words, districts, categories, limit, true);
}

function find<T extends Searchable>(
  index: Entry<T>[],
  query: string,
  words: string[],
  districts: string[],
  categories: { kind: string; name: string }[],
  limit: number,
  fuzzy: boolean,
): Results<T> {
  const matches = index.filter((e) => words.every((w) => has(e.text, w, fuzzy)));
  matches.sort(
    (a, b) => rank(a.name, query, words, fuzzy) - rank(b.name, query, words, fuzzy) || a.name.length - b.name.length,
  );

  const byDistrict = new Map<string, number>();
  for (const e of index) if (e.it.district) byDistrict.set(e.it.district, (byDistrict.get(e.it.district) ?? 0) + 1);
  const byKind = new Map<string, number>();
  for (const e of index) byKind.set(e.it.kind, (byKind.get(e.it.kind) ?? 0) + 1);
  const named = (name: string) => words.every((w) => has(normalize(name), w, fuzzy));

  return {
    districts: districts.filter(named).map((name) => ({ name, count: byDistrict.get(name) ?? 0 })),
    categories: categories.filter((c) => named(c.name)).map((c) => ({ ...c, count: byKind.get(c.kind) ?? 0 })),
    items: matches.slice(0, limit).map((e) => e.it),
    more: Math.max(0, matches.length - limit),
    fuzzy,
  };
}
