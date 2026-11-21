// Links that open a pre-filled GitHub issue (.github/ISSUE_TEMPLATE/*.yml), so players can report
// a missing or wrong location from the map without knowing the JSON format.
import type { Item } from "./data";
import { toGame } from "./geo";
import { REPO_URL } from "./repo";

export { districtAt, toGame } from "./geo";

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
