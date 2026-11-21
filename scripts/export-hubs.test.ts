import { describe, expect, it } from "vitest";
import { buildHubs, slug } from "./export-hubs";

const site = "https://example.github.io/gta6";
const items = [
  {
    id: "meteorite-001",
    name: "Meteorite Fragment",
    kind: "meteorite",
    district: "Key Lento",
    hasPage: true,
    detail: "",
  },
  {
    id: "meteorite-002",
    name: "Meteorite Fragment",
    kind: "meteorite",
    district: "Hamlet",
    hasPage: false,
    detail: "",
  },
  { id: "L13", name: "Albany Hotel", kind: "hotel", district: "Vice Beach", hasPage: true, detail: "" },
];
const kinds = [
  { key: "meteorite", name: "Meteorites", group: "Collectibles" },
  { key: "hotel", name: "Hotels", group: "Places" },
  { key: "treasure", name: "Treasures", group: "Collectibles" },
];
const pages = new Map(buildHubs(items, kinds, ["Collectibles", "Places"], site));

describe("list pages", () => {
  it("makes one per category with locations, one per district and a browse index, at readable paths", () => {
    expect([...pages.keys()].sort()).toEqual(
      ["browse/", "c/hotels/", "c/meteorites/", "d/hamlet/", "d/key-lento/", "d/vice-beach/"].sort(),
    );
    expect(slug("Fences and Pay 'n' Spray")).toBe("fences-and-pay-n-spray");
  });

  it("links a location to its page when it has one, and to its pin on the map otherwise", () => {
    const html = pages.get("c/meteorites/")!;
    expect(html).toContain('<a href="../../l/meteorite-001/">');
    expect(html).toContain('<a href="../../?id=meteorite-002">');
    expect(html).toContain("<title>GTA 6 Meteorites: all 2 locations | Open GTA 6 Map</title>");
    expect(html).toContain(`<link rel="canonical" href="${site}/c/meteorites/">`);
  });

  it("carries breadcrumbs for search results", () => {
    const ld = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(pages.get("d/hamlet/")!)![1];
    const crumbs = (JSON.parse(ld) as { itemListElement: { name: string }[] }).itemListElement;
    expect(crumbs.map((e) => e.name)).toEqual(["Open GTA 6 Map", "Browse", "Hamlet"]);
  });
});
