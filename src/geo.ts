// Pure geometry on map units, shared by the app and the build scripts (no browser or build globals).

/** A district outline: one or more rings of [x, y] map units. */
export type Outline = { name: string; rings: [number, number][][] };

/** Map units to game coordinates (README: x = (gx + 16384) / 32, y = (16384 - gy) / 32). */
export const toGame = (x: number, y: number) => ({ gx: Math.round(x * 32 - 16384), gy: Math.round(16384 - y * 32) });

/** The district whose outline contains the point, by ray casting; undefined outside all of them. */
export function districtAt(x: number, y: number, districts: Outline[]): string | undefined {
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

/**
 * Looks the real-world place up on Google Maps (its documented search URL), to compare it with the game
 * in Street View. OpenStreetMap search was tried: it found 8 of 20 sampled addresses and no plus codes.
 */
export const realWorldMapUrl = (realLife: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(realLife)}`;
