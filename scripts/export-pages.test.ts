import { describe, expect, it } from "vitest";
import { buildPage, buildSitemap, hasPage, metaDescription, what, type Entry } from "./export-pages.ts";

const card: Entry = {
  id: "hidden-package-001",
  kind: "card",
  x: 448.5,
  y: 690.4,
  name: "Los Santos Panic card: Marquise Bernard",
  type: "Los Santos Panic card",
  description: "On a barrel at Kenton's <shop>",
  screenshot: "screenshots/hidden-package-001.webp",
};
const kind = { key: "card", name: "Collectible cards", colour: "#ffd166" };
const site = "https://example.github.io/gta6";

describe("hasPage", () => {
  it("gives pages to locations with a description, screenshot or real-world address only", () => {
    expect(hasPage(card)).toBe(true);
    expect(hasPage({ ...card, description: "", screenshot: null })).toBe(false);
    expect(hasPage({ id: "L1", kind: "hotel", x: 1, y: 1, name: "Vice Regal", real_life: "The Ritz-Carlton" })).toBe(
      true,
    );
  });
});

describe("metaDescription", () => {
  it("leads with what and where", () => {
    expect(metaDescription({ ...card, description: "" }, "Los Santos Panic card", "Key Lento")).toBe(
      "Los Santos Panic card in Key Lento, Leonida.",
    );
  });

  it("stays under the length search engines show, cutting at a word", () => {
    const long = metaDescription({ ...card, description: "word ".repeat(80) }, "Card", "Key Lento");
    expect(long.length).toBeLessThanOrEqual(158);
    expect(long.endsWith("word...")).toBe(true);
  });
});

describe("buildPage", () => {
  const html = buildPage(card, kind, "Key Lento", [{ ...card, id: "fence-014", name: "Kenton" }], site);

  it("has a canonical URL, title and preview image for search and sharing", () => {
    expect(html).toContain(`<link rel="canonical" href="${site}/l/hidden-package-001/">`);
    expect(html).toContain("<title>Los Santos Panic card: Marquise Bernard, Key Lento | Open GTA 6 Map</title>");
    expect(html).toContain(`content="${site}/screenshots/hidden-package-001.webp"`);
  });

  it("sizes the screenshot so the text below it doesn't jump when it loads", () => {
    const sized = buildPage(card, kind, "Key Lento", [], site, undefined, { width: 960, height: 1280 });
    expect(sized).toMatch(/<img src="..\/..\/screenshots\/hidden-package-001.webp" width="960" height="1280" /);
  });

  it("links to the map and to nearby pages with relative URLs, so previews work too", () => {
    expect(html).toContain('href="../../?id=hidden-package-001"');
    expect(html).toContain('<a href="../fence-014/">Kenton</a>');
  });

  it("escapes text from the data", () => {
    expect(html).toContain("Kenton&#39;s &lt;shop&gt;");
    expect(html).not.toContain("<shop>");
  });
});

describe("buildSitemap", () => {
  it("lists the home page and every location page", () => {
    const xml = buildSitemap(["a-1", "b-2"], site);
    expect(xml).toContain(`<loc>${site}/</loc>`);
    expect(xml).toContain(`<loc>${site}/l/b-2/</loc>`);
  });
});

describe("labels", () => {
  it("names places in the singular, from their service when they have one", () => {
    const hotel = buildPage(
      { id: "L1", kind: "hotel", x: 1, y: 1, name: "Vice Regal", real_life: "Ritz" },
      { key: "hotel", name: "Hotels", colour: "#fff" },
      "Vice Beach",
      [],
      site,
    );
    expect(hotel).toContain("<title>Vice Regal (Hotel), Vice Beach | Open GTA 6 Map</title>");
    expect(what({ id: "L2", kind: "transport", x: 1, y: 1, name: "Pier", service: "Marina" }, "Transport")).toBe(
      "Marina",
    );
  });

  it("shows what each nearby location is, so two called Bridge can be told apart", () => {
    const html = buildPage(
      card,
      kind,
      "Key Lento",
      [{ id: "under-the-bridge-001", kind: "bridge", x: 1, y: 1, name: "Bridge", type: "Under the bridge" }],
      site,
    );
    expect(html).toContain('<a href="../under-the-bridge-001/">Bridge</a> <span class="muted">Under the bridge</span>');
  });
});
