// Links that open a pre-filled GitHub issue (.github/ISSUE_TEMPLATE/*.yml), so players can report
// a missing or wrong location from the map without knowing the JSON format.
import type { Item } from "./data";
import { toGame } from "./geo";
import { REPO_URL } from "./repo";

export { districtAt, realWorldMapUrl, toGame } from "./geo";

const issueUrl = (fields: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v) p.set(k, v);
  return `${REPO_URL}/issues/new?${p}`;
};

export function missingLocationUrl(x: number, y: number, district?: string) {
  const { gx, gy } = toGame(x, y);
  return issueUrl({
    template: "missing-location.yml",
    position: `x ${x.toFixed(1)}, y ${y.toFixed(1)}`,
    "game-coords": `X ${gx}, Y ${gy}`,
    district,
  });
}

export function wrongLocationUrl(it: Pick<Item, "id" | "name">) {
  return issueUrl({ template: "wrong-location.yml", title: `Wrong: ${it.name}`, "location-id": it.id, name: it.name });
}

/** Opens the screenshot form, set to add one or replace the current one. */
export function screenshotUrl(it: Pick<Item, "id" | "name" | "screenshot">) {
  return issueUrl({
    template: "screenshot.yml",
    title: `Screenshot: ${it.name}`,
    "location-id": it.id,
    name: it.name,
    action: it.screenshot ? "Replace the current one" : "Add (it has no screenshot)",
  });
}

/** Opens the real-world form to suggest a match for a place, or correct the one it has. */
export function realWorldUrl(it: Pick<Item, "id" | "name" | "real_life">) {
  return issueUrl({
    template: "real-world.yml",
    title: `Real world: ${it.name}`,
    "location-id": it.id,
    name: it.name,
    current: it.real_life,
  });
}
