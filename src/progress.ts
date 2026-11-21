// Progress links: a player's "found" list packed into a short URL, so it can move between devices
// without accounts or a server. One bit per trackable location, in id order, as base64url, behind a
// checksum of that id list: if the map data changes, an old link is recognised instead of misread.

/** The locations a player can mark as found, in the fixed order the bits follow. */
export const trackableIds = (items: { id: string; kind: string }[], trackable: (kind: string) => boolean) =>
  items
    .filter((it) => trackable(it.kind))
    .map((it) => it.id)
    .sort();

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

export function encodeProgress(found: Set<string>, ids: string[]): string {
  const bytes = new Uint8Array(Math.ceil(ids.length / 8));
  ids.forEach((id, i) => {
    if (found.has(id)) bytes[i >> 3] |= 1 << (i & 7);
  });
  return `${checksum(ids)}.${toBase64Url(bytes)}`;
}

export type Decoded = { ok: true; found: Set<string> } | { ok: false; reason: "outdated" | "invalid" };

export function decodeProgress(code: string, ids: string[]): Decoded {
  const [sum, data] = code.split(".");
  if (!sum || data === undefined) return { ok: false, reason: "invalid" };
  if (sum !== checksum(ids)) return { ok: false, reason: "outdated" };
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(data);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (bytes.length !== Math.ceil(ids.length / 8)) return { ok: false, reason: "invalid" };
  return { ok: true, found: new Set(ids.filter((_, i) => bytes[i >> 3] & (1 << (i & 7)))) };
}
