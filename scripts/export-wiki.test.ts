import type { Outline } from "../src/geo.ts";
import { describe, expect, it } from "vitest";
import { buildCompletionMap, buildWikiMaps, MAP_IMAGE, toImage, WIKI_NAMES } from "./export-wiki.ts";

const square: Outline = {
  name: "Vice City",
  rings: [
    [
      [500, 500],
      [520, 500],
      [520, 520],
      [500, 520],
      [500, 500],
    ],
  ],
};
const kinds = [
  { key: "package", colour: "#ffb703", pinnable: true },
  { key: "shop", colour: "#000000", pinnable: false }, // a Places kind: not exported
];
const locations = [
  { id: "hidden-package-001", kind: "package", x: 510, y: 510, name: "Shipwreck", description: "Under [the] pier" },
  { id: "hidden-package-002", kind: "package", x: 300, y: 300, name: "Crate" },
  { id: "clothing-001", kind: "shop", x: 510, y: 510, name: "Stock 305" },
];

describe("toImage", () => {
  it("maps the image's corners, with the origin at the bottom-left", () => {
    expect(toImage(128, 832)).toEqual([0, 0]);
    expect(toImage(832, 128)).toEqual([3520, 3520]);
    expect(toImage(480, 480)).toEqual([1760, 1760]);
  });
});

describe("buildWikiMaps", () => {
  const maps = buildWikiMaps(kinds, locations, [square], "https://github.com/o/r");

  it("makes one page per exported kind, named like the wiki's maps", () => {
    expect(maps.map((m) => m.title)).toEqual(["Map:GTA VI: Hidden Packages"]);
    expect(maps[0].json.mapImage).toBe(MAP_IMAGE);
    expect(maps[0].json.categories).toEqual([
      { id: "1", listId: 1, name: "Hidden Package", color: "#ffb703", symbol: "", symbolColor: "" },
    ]);
    expect(maps[0].json.markerProgress).toBe(true);
  });

  it("links the district, falls back to Leonida, and strips wiki markup from text", () => {
    const [inTown, outside] = maps[0].json.markers;
    expect(inTown.popup.description).toBe("Location: [[Vice City]]<br/>Under the pier");
    expect(outside.popup.description).toBe("Location: [[State of Leonida|Leonida]]");
    expect(inTown.popup.link).toEqual({ url: "", label: "" });
  });

  it("credits the source once, in the map description", () => {
    expect(maps[0].json.description).toContain("[https://github.com/o/r Open GTA 6 Map]");
  });

  it("has wiki names for every kind outside Places", () => {
    expect(Object.keys(WIKI_NAMES)).toHaveLength(32);
  });
});

describe("buildCompletionMap", () => {
  const completionKinds = [
    { key: "gang", colour: "#d62828", pinnable: true },
    { key: "weapon", colour: "#8d99ae", pinnable: true },
  ];
  const items = [
    { id: "gang-operation-001", kind: "gang", x: 510, y: 510, name: "Gang op" },
    { id: "weapon-spawn-001", kind: "weapon", x: 300, y: 300, name: "Pistol" },
    { id: "weapon-spawn-002", kind: "weapon", x: 301, y: 300, name: "Shotgun" },
  ];
  const map = buildCompletionMap(completionKinds, items, [square], "https://github.com/o/r");

  it("is one page with a layer per completion item, named as the article names them", () => {
    expect(map.title).toBe("Map:GTA VI: 100% Completion");
    expect(map.json.categories.map((c) => c.name)).toEqual(["Gang Operations", "Weapons"]);
  });

  it("puts each marker in its layer, with ids unique across layers", () => {
    expect(map.json.markers.map((m) => m.categoryId)).toEqual(["1", "2", "2"]);
    expect(new Set(map.json.markers.map((m) => m.id)).size).toBe(3);
  });
});
