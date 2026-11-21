// Links that open a pre-filled GitHub issue (.github/ISSUE_TEMPLATE/*.yml), so players can report
// a missing or wrong location from the map without knowing the JSON format.
import type { District, Item } from "./data";
import { REPO_URL } from "./repo";

/** Map units to game coordinates (README: x = (gx + 16384) / 32, y = (16384 - gy) / 32). */
export const toGame = (x: number, y: number) => ({ gx: Math.round(x * 32 - 16384), gy: Math.round(16384 - y * 32) });

/** The district whose outline contains the point, by ray casting; undefined outside all of them. */
export function districtAt(x: number, y: number, districts: District[]): string | undefined {
  const inside = (ring: [number, number][]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  return districts.find((d) => d.rings.some(inside))?.name;
}

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
