/**
 * Exports the map data as GloopMaps pages for gta.wiki, in the same shape as the wiki's own maps
 * (for example Map:GTA Vice City: Hidden Packages): one map per collectible or activity, a single
 * colour-coded category, "Location: [[District]]" popups, and one shared map image.
 *
 * Runs as the last step of `pnpm build` and writes into dist/wiki/, so every deploy publishes:
 *   wiki/index.json                       what to create on the wiki, and where to get it
 *   wiki/maps/<kind>.json                 the JSON for each Map:GTA VI: ... page
 *   wiki/Leonida-GTAVI-Map.jpg            the map image those pages point at
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { districtAt, type Outline } from "../src/geo.ts";

/** The wiki file name of the map image; every map page points at it. */
export const MAP_IMAGE = "Leonida-GTAVI-Map.jpg";

// The image is the day base map at zoom 2: tiles 2..12 on both axes, each 64 map units square.
const TILE_ZOOM = 2;
const TILE_RANGE = [2, 12] as const;
const UNITS_PER_TILE = 64;
const PX_PER_TILE = 320; // 3520 px square, close to the wiki's 3660 px Vice City map
const SCALE = PX_PER_TILE / UNITS_PER_TILE;
const ORIGIN = TILE_RANGE[0] * UNITS_PER_TILE; // map units at the image's left / top edge
const SIZE = (TILE_RANGE[1] - TILE_RANGE[0] + 1) * PX_PER_TILE;

/** Wiki page names (plural) and marker category names (singular), following the existing maps. */
export const WIKI_NAMES: Record<string, [plural: string, singular: string]> = {
  card: ["Collectible Cards", "Collectible Card"],
  waink: ["WAiNK Scans", "WAiNK Scan"],
  magazine: ["Magazines, Books and Comics", "Magazine, Book or Comic"],
  playlist: ["Unique Playlists", "Unique Playlist"],
  package: ["Hidden Packages", "Hidden Package"],
  meteorite: ["Meteorites", "Meteorite"],
  treasure: ["Treasures", "Treasure"],
  bottle: ["Messages in a Bottle", "Message in a Bottle"],
  bookswap: ["Book Swaps", "Book Swap"],
  mural: ["1010 Murals", "1010 Mural"],
  vehicle: ["Standout Vehicles", "Standout Vehicle"],
  hoop: ["Basketball Hoops", "Basketball Hoop"],
  stunt: ["Stunt Jumps", "Stunt Jump"],
  race: ["Races", "Race"],
  drone: ["Drone Time Trials", "Drone Time Trial"],
  range: ["Shooting Ranges", "Shooting Range"],
  arcade: ["Video Games, Pool and Mini Golf", "Video Game, Pool or Mini Golf"],
  bridge: ["Under the Bridge Flights", "Under the Bridge Flight"],
  knife: ["Knife Flights", "Knife Flight"],
  basejump: ["BASE Jumps", "BASE Jump"],
  fishing: ["Fishing Spots", "Fishing Spot"],
  hunting: ["Hunting Locations", "Hunting Location"],
  event: ["Random Events", "Random Event"],
  gang: ["Gang Operations", "Gang Operation"],
  bank: ["Banks and Vaults", "Bank or Vault"],
  smash: ["Smash 'n' Grabs", "Smash 'n' Grab"],
  store: ["Store Robberies", "Store Robbery"],
  fence: ["Fences and Pay 'n' Spray", "Fence or Pay 'n' Spray"],
  safe: ["Safes", "Safe"],
  towatm: ["Towable ATMs", "Towable ATM"],
  payday: ["Payday Loans", "Payday Loan"],
  weapon: ["Weapon Pickups", "Weapon Pickup"],
};

type Kind = { key: string; colour: string; pinnable: boolean };
type Location = { id: string; kind: string; x: number; y: number; name: string; description?: string };

/** Map units to the image's pixels; GloopMaps puts the origin at the bottom-left. */
export const toImage = (x: number, y: number): [number, number] => [
  Math.round((x - ORIGIN) * SCALE * 100) / 100,
  Math.round((SIZE - (y - ORIGIN) * SCALE) * 100) / 100,
];

/** Keeps contributor text from being read as wiki markup. */
const plain = (s: string) => s.replace(/[[\]{}<>|]/g, "");

/** One GloopMaps page: shared image and settings, one category per entry in `layers`. */
function mapPage(
  layers: { kind: string; name: string; colour: string }[],
  locations: Location[],
  districts: Outline[],
  repoUrl: string,
  progress: boolean,
) {
  let id = 0;
  return {
    mapImage: MAP_IMAGE,
    pageCategories: [],
    defaultSort: "",
    description: `Marker data from [${repoUrl} Open GTA 6 Map] (CC BY 4.0).`,
    coordinateOrder: "xy",
    mapBounds: [
      [0, 0],
      [SIZE, SIZE],
    ],
    origin: "bottom-left",
    useMarkerClustering: true,
    categories: layers.map((l, i) => ({
      id: String(i + 1),
      listId: i + 1,
      name: l.name,
      color: l.colour,
      symbol: "",
      symbolColor: "",
    })),
    markers: layers.flatMap((l, i) =>
      locations
        .filter((it) => it.kind === l.kind)
        .map((it) => {
          const district = districtAt(it.x, it.y, districts);
          const where = `Location: ${district ? `[[${district}]]` : "[[State of Leonida|Leonida]]"}`;
          return {
            categoryId: String(i + 1),
            id: String(++id),
            position: toImage(it.x, it.y),
            popup: {
              title: plain(it.name),
              description: it.description ? `${where}<br/>${plain(it.description)}` : where,
              link: { url: "", label: "" },
            },
          };
        }),
    ),
    markerProgress: progress,
  };
}

export function buildWikiMaps(kinds: Kind[], locations: Location[], districts: Outline[], repoUrl: string) {
  return kinds
    .filter((k) => WIKI_NAMES[k.key])
    .map((k) => ({
      kind: k.key,
      title: `Map:GTA VI: ${WIKI_NAMES[k.key][0]}`,
      json: mapPage(
        [{ kind: k.key, name: WIKI_NAMES[k.key][1], colour: k.colour }],
        locations,
        districts,
        repoUrl,
        k.pinnable,
      ),
    }));
}

/**
 * The items on "100% Completion in GTA VI" that we have locations for, named as that article names
 * them. One map with a layer per item: maps inside tabs draw blank (they size themselves while hidden),
 * so the article shows this single map instead of a tab per category.
 */
export const COMPLETION_LAYERS: [kind: string, name: string][] = [
  ["gang", "Gang Operations"],
  ["bank", "Bank Jobs"],
  ["smash", "Smash 'N' Grabs"],
  ["store", "Stick Ups"],
  ["fence", "Fences"],
  ["waink", "WAiNK Scans"],
  ["card", "Collectible Cards"],
  ["magazine", "Magazines, Books & Comics"],
  ["bookswap", "Book Swaps"],
  ["playlist", "Unique Playlists"],
  ["race", "Unique Races"],
  ["range", "Shooting Ranges"],
  ["arcade", "Video Games, Pool & Mini Golf"],
  ["hoop", "Basketball Hoops"],
  ["drone", "Drone Time Trials"],
  ["stunt", "Stunt Jumps"],
  ["bridge", "Under the Bridge"],
  ["knife", "Knife Flights"],
  ["basejump", "BASE Jumps"],
  ["weapon", "Weapons"],
];

export function buildCompletionMap(kinds: Kind[], locations: Location[], districts: Outline[], repoUrl: string) {
  const colour = new Map(kinds.map((k) => [k.key, k.colour]));
  const layers = COMPLETION_LAYERS.filter(([kind]) => colour.has(kind)).map(([kind, name]) => ({
    kind,
    name,
    colour: colour.get(kind)!,
  }));
  return {
    kind: "completion",
    title: "Map:GTA VI: 100% Completion",
    json: mapPage(layers, locations, districts, repoUrl, true),
  };
}

/** Stitches the day tiles into the single map image the wiki pages use. */
async function stitchMapImage(tilesDir: string, out: string) {
  const [lo, hi] = TILE_RANGE;
  const parts = [];
  for (let ty = lo; ty <= hi; ty++)
    for (let tx = lo; tx <= hi; tx++) {
      const tile = await sharp(join(tilesDir, `${TILE_ZOOM}`, `${TILE_ZOOM},${ty},${tx}.webp`))
        .resize(PX_PER_TILE, PX_PER_TILE)
        .toBuffer();
      parts.push({ input: tile, left: (tx - lo) * PX_PER_TILE, top: (ty - lo) * PX_PER_TILE });
    }
  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: "#46c8d2" } })
    .composite(parts)
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(out);
}

if (import.meta.main) {
  const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
  const repoUrl = `https://github.com/${process.env.GITHUB_REPOSITORY ?? "fbritoferreira/gta6"}`;
  const kinds = read<{ kinds: Kind[] }>("public/data/categories.json").kinds;
  const locations = read<Location[]>("public/data/locations.json");
  const districts = read<Outline[]>("public/data/districts.json");
  const maps = [
    ...buildWikiMaps(kinds, locations, districts, repoUrl),
    buildCompletionMap(kinds, locations, districts, repoUrl),
  ];
  mkdirSync("dist/wiki/maps", { recursive: true });
  for (const m of maps) writeFileSync(`dist/wiki/maps/${m.kind}.json`, JSON.stringify(m.json, null, "\t") + "\n");
  await stitchMapImage("public/tiles/day", `dist/wiki/${MAP_IMAGE}`);
  const index = {
    note:
      "GloopMaps pages for gta.wiki. Upload the image as File:" + MAP_IMAGE + ", then create each page with its JSON.",
    image: { wikiFile: `File:${MAP_IMAGE}`, path: MAP_IMAGE, size: [SIZE, SIZE] },
    maps: maps.map((m) => ({ title: m.title, path: `maps/${m.kind}.json`, markers: m.json.markers.length })),
  };
  writeFileSync("dist/wiki/index.json", JSON.stringify(index, null, 2) + "\n");
  console.log(
    `wiki export: ${maps.length} maps, ${index.maps.reduce((n, m) => n + m.markers, 0)} markers, ${MAP_IMAGE}`,
  );
}
