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
    kinds: new Set(
      p.has("kinds")
        ? p
            .get("kinds")!
            .split(",")
            .filter((k) => knownKinds.has(k))
        : defaultKinds,
    ),
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

/** Only values that differ from the defaults are written, so links stay short. */
export function writeUrl(f: Filters, defaultKinds: string[], view?: View) {
  const p = new URLSearchParams();
  if (f.style !== "night") p.set("style", f.style);
  const kinds = [...f.kinds].sort().join(",");
  if (kinds !== [...defaultKinds].sort().join(",")) p.set("kinds", kinds);
  if (!f.labels) p.set("labels", "0");
  if (f.hideFound) p.set("hidefound", "1");
  if (f.district) p.set("district", f.district);
  if (view) p.set("view", `${view.zoom}/${view.x.toFixed(1)}/${view.y.toFixed(1)}`);
  return p;
}
