/**
 * Build approximate district outlines from the places data.
 *
 * There is no official boundary data, so each district's outline is estimated:
 * every place in public/data/places.json whose `area` names a district in public/data/labels.json
 * (plus the label point itself) seeds that district. The map is split between the
 * seeds by nearest neighbour (Voronoi), and each district keeps only the ground within
 * REACH map units of its own places. Outlines get better as places.json gets better.
 *
 *   pnpm districts
 *
 * Districts end at the coast: each is clipped to public/data/land.json (the land as polygons in map
 * units, holes for lakes), so no outline spills into the sea.
 *
 * Writes public/data/districts.json: [{ name, x, y, rings: [[[x, y], ...], ...] }].
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Delaunay } from "d3-delaunay";
import { intersection, union } from "polyclip-ts";
import simplify from "simplify-js";

type Pt = [number, number];
type Ring = Pt[];
type MultiPolygon = Ring[][];

const REACH = 18; // map units a district extends past its outermost places
const SIMPLIFY = 0.6; // map units; keeps the file small
const MIN_AREA = 20; // drop slivers smaller than this (square map units)

const labels = JSON.parse(readFileSync("public/data/labels.json", "utf8")) as { name: string; x: number; y: number }[];
const places = JSON.parse(readFileSync("public/data/places.json", "utf8")) as { x: number; y: number; area?: string }[];
const land = JSON.parse(readFileSync("public/data/land.json", "utf8")) as MultiPolygon;
const names = new Set(labels.map((l) => l.name));

/** `area` is "Neighbourhood, District" or "District"; return the district if we know it. */
const districtOf = (area = "") =>
  area
    .split(",")
    .map((s) => s.trim())
    .reverse()
    .find((p) => names.has(p));

const seeds = new Map<string, Pt[]>(labels.map((l) => [l.name, [[l.x, l.y]]]));
for (const p of places) {
  const d = districtOf(p.area);
  if (d) seeds.get(d)!.push([p.x, p.y]);
}

// One Voronoi cell per distinct point; the first district to claim a spot keeps it.
const owner = new Map<string, string>();
for (const [name, pts] of seeds) for (const [x, y] of pts) if (!owner.has(`${x},${y}`)) owner.set(`${x},${y}`, name);
const points = [...owner.keys()].map((k) => k.split(",").map(Number) as Pt);
const voronoi = Delaunay.from(points).voronoi([0, 0, 1024, 1024]);

const cells = new Map<string, Ring[][]>([...seeds.keys()].map((n) => [n, []]));
points.forEach((pt, i) => {
  const cell = voronoi.cellPolygon(i);
  if (cell) cells.get(owner.get(`${pt[0]},${pt[1]}`)!)!.push([cell]);
});

const circle = ([cx, cy]: Pt, r: number, n = 32): Ring[] => {
  const ring: Ring = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  return [[...ring, ring[0]]];
};

const area = (ring: Ring) =>
  Math.abs(
    ring.reduce((s, [x, y], i) => {
      const [nx, ny] = ring[(i + 1) % ring.length];
      return s + x * ny - nx * y;
    }, 0),
  ) / 2;

const out = labels.map((label) => {
  const [first, ...rest] = cells.get(label.name)!;
  const territory: MultiPolygon = union(first, ...rest);
  const [c0, ...cn] = seeds.get(label.name)!.map((p) => circle(p, REACH));
  const reach: MultiPolygon = union(c0, ...cn);
  const shape: MultiPolygon = intersection(territory, reach, land);
  const rings = shape
    .map((poly) => poly[0]) // outer ring only; holes are lakes and gaps we don't need
    .filter((ring) => area(ring) > MIN_AREA)
    .map((ring) =>
      simplify(
        ring.map(([x, y]) => ({ x, y })),
        SIMPLIFY,
        true,
      ).map(({ x, y }) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]),
    );
  console.log(
    `${label.name.padEnd(14)} seeds=${String(seeds.get(label.name)!.length).padStart(3)} rings=${rings.length}`,
  );
  return { name: label.name, x: label.x, y: label.y, rings };
});

writeFileSync("public/data/districts.json", JSON.stringify(out, null, 1) + "\n");
