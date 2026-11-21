// The map's state lives in the query string so any view can be shared or embedded.
// README has the parameter table; keep the two in step.

export type Style = "night" | "day";
export type Filters = { style: Style; kinds: Set<string>; labels: boolean; hideFound: boolean; district?: string };
export type View = { zoom: number; x: number; y: number };

export function readUrl(search: string, knownKinds: Set<string>, defaultKinds: string[]) {
  const p = new URLSearchParams(search);
  const view = p.get("view")?.split("/").map(Number);
  const filters: Filters = {
    style: p.get("style") === "day" ? "day" : "night",
    kinds: p.has("kinds") ? readKinds(p.get("kinds")!, knownKinds, defaultKinds) : new Set(defaultKinds),
    labels: p.get("labels") !== "0",
    hideFound: p.get("hidefound") === "1",
    district: p.get("district") ?? undefined,
  };
  return {
    filters,
    view: view?.length === 3 && view.every(Number.isFinite) ? { zoom: view[0], x: view[1], y: view[2] } : undefined,
    id: p.get("id") ?? undefined,
    progress: p.get("progress") ?? undefined,
    embed: p.has("embed"),
  };
}

/**
 * `kinds` is a list of keys, or "default" plus changes: "default,hotel" is the defaults and hotels,
 * "default,-card" the defaults without cards. Unknown keys are dropped.
 */
function readKinds(value: string, known: Set<string>, defaults: string[]) {
  const parts = value.split(",").filter(Boolean);
  const kinds = new Set(parts[0] === "default" ? defaults : []);
  for (const part of parts[0] === "default" ? parts.slice(1) : parts) {
    const off = part.startsWith("-");
    const key = off ? part.slice(1) : part;
    if (!known.has(key)) continue;
    if (off) kinds.delete(key);
    else kinds.add(key);
  }
  return kinds;
}

/** The shorter of the full list and "default" plus changes. */
function writeKinds(kinds: Set<string>, defaults: string[]) {
  const full = [...kinds].sort().join(",");
  const changes = [
    "default",
    ...[...kinds].filter((k) => !defaults.includes(k)).sort(),
    ...defaults
      .filter((k) => !kinds.has(k))
      .map((k) => `-${k}`)
      .sort(),
  ].join(",");
  return changes.length < full.length ? changes : full;
}

/** Only values that differ from the defaults are written, so links stay short. */
export function writeUrl(f: Filters, defaultKinds: string[], view?: View) {
  const p = new URLSearchParams();
  if (f.style !== "night") p.set("style", f.style);
  if ([...f.kinds].sort().join(",") !== [...defaultKinds].sort().join(","))
    p.set("kinds", writeKinds(f.kinds, defaultKinds));
  if (!f.labels) p.set("labels", "0");
  if (f.hideFound) p.set("hidefound", "1");
  if (f.district) p.set("district", f.district);
  if (view) p.set("view", `${view.zoom}/${view.x.toFixed(1)}/${view.y.toFixed(1)}`);
  return p;
}
