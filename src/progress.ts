// Progress links: a player's "found" list packed into a short URL, so it can move between devices
// without accounts or a server. One bit per trackable location, as base64url.
//
// The bits follow the order locations appear in the data. The data sync only appends new locations,
// so a link records how many ids it covers (n) and a checksum of those first n: after a sync it still
// reads, and the new locations are simply not found yet. If an earlier entry changed (removed,
// refiled, reordered), the checksum no longer matches and the link is reported as outdated rather
// than misread.
//
// Links made before this format ("sum.bits", ids sorted, checksum of the whole list) still decode.

/** The locations a player can mark as found, in data order: the order the bits follow. */
export const trackableIds = (items: { id: string; kind: string }[], trackable: (kind: string) => boolean) =>
  items.filter((it) => trackable(it.kind)).map((it) => it.id);

/** FNV-1a over the id list, as 6 base-36 characters. */
export function checksum(ids: string[]): string {
  let h = 0x811c9dc5;
  for (const ch of ids.join(",")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0").slice(-6);
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromBase64Url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

const pack = (found: Set<string>, ids: string[]) => {
  const bytes = new Uint8Array(Math.ceil(ids.length / 8));
  ids.forEach((id, i) => {
    if (found.has(id)) bytes[i >> 3] |= 1 << (i & 7);
  });
  return toBase64Url(bytes);
};

/** "sum.n.bits": the checksum of the first n ids, n in base 36, then the bits. */
export function encodeProgress(found: Set<string>, ids: string[]): string {
  return `${checksum(ids)}.${ids.length.toString(36)}.${pack(found, ids)}`;
}

export type Decoded = { ok: true; found: Set<string> } | { ok: false; reason: "outdated" | "invalid" };

function unpack(data: string, ids: string[]): Decoded {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(data);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (bytes.length !== Math.ceil(ids.length / 8)) return { ok: false, reason: "invalid" };
  return { ok: true, found: new Set(ids.filter((_, i) => bytes[i >> 3] & (1 << (i & 7)))) };
}

export function decodeProgress(code: string, ids: string[]): Decoded {
  const parts = code.split(".");
  if (parts.length === 3) {
    const [sum, count, data] = parts;
    const n = parseInt(count, 36);
    if (!sum || !Number.isInteger(n) || n < 0 || count !== n.toString(36)) return { ok: false, reason: "invalid" };
    if (n > ids.length || sum !== checksum(ids.slice(0, n))) return { ok: false, reason: "outdated" };
    return unpack(data, ids.slice(0, n));
  }
  // The first format: ids sorted, checksum of the whole list, so any data change made it outdated.
  const [sum, data] = parts;
  if (parts.length !== 2 || !sum) return { ok: false, reason: "invalid" };
  const sorted = [...ids].sort();
  if (sum !== checksum(sorted)) return { ok: false, reason: "outdated" };
  return unpack(data, sorted);
}
