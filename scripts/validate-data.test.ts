import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findDuplicates, validateData } from "./validate-data";

/** Writes a tiny public/ tree; each override replaces one file's contents. */
function fixture(overrides: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "gta6-data-"));
  mkdirSync(join(root, "data"));
  mkdirSync(join(root, "icons/pins"), { recursive: true });
  mkdirSync(join(root, "screenshots"));
  writeFileSync(join(root, "screenshots/bank-001.webp"), "");
  writeFileSync(join(root, "icons/pins/bank.webp"), "");
  const files: Record<string, unknown> = {
    "data/categories.json": { kinds: [{ key: "bank" }, { key: "food" }] },
    "data/locations.json": [
      { id: "bank-001", kind: "bank", name: "Bank", x: 1, y: 1, screenshot: "screenshots/bank-001.webp" },
    ],
    "data/places.json": [{ id: "L1", kind: "food", name: "Diner", x: 2, y: 2 }],
    "icons/pins/index.json": ["bank"],
    ...overrides,
  };
  for (const [path, value] of Object.entries(files)) writeFileSync(join(root, path), JSON.stringify(value));
  return root;
}

describe("validateData", () => {
  it("passes on the real data", () => {
    expect(validateData("public")).toEqual([]);
  });

  it("passes on a valid fixture", () => {
    expect(validateData(fixture())).toEqual([]);
  });

  it("reports a missing screenshot", () => {
    const root = fixture({
      "data/locations.json": [{ id: "bank-001", kind: "bank", screenshot: "screenshots/nope.webp" }],
    });
    expect(validateData(root).join()).toContain("screenshots/nope.webp");
  });

  it("reports a screenshot path with a leading slash, which breaks under /<repo>/ on Pages", () => {
    const root = fixture({
      "data/locations.json": [{ id: "bank-001", kind: "bank", screenshot: "/screenshots/bank-001.webp" }],
    });
    expect(validateData(root).join()).toContain("no leading /");
  });

  it("reports a kind that isn't in categories.json", () => {
    const root = fixture({ "data/places.json": [{ id: "L1", kind: "spaceport" }] });
    expect(validateData(root).join()).toContain("spaceport");
  });

  it("reports an id used twice across locations and places", () => {
    const root = fixture({ "data/places.json": [{ id: "bank-001", kind: "food" }] });
    expect(validateData(root).join()).toContain("Duplicate ids");
  });

  it("reports an entry missing a field instead of crashing", () => {
    const root = fixture({ "data/places.json": [{ id: "L9", kind: "food", x: 1, y: 1 }] });
    expect(validateData(root).join()).toContain("missing a field");
  });

  it("reports a pin listed without a file", () => {
    const root = fixture({ "icons/pins/index.json": ["bank", "ghost"] });
    expect(validateData(root).join()).toContain("ghost");
  });
});

describe("findDuplicates", () => {
  const at = (id: string, name: string, x: number, kind = "food") => ({ id, kind, name, x, y: 100 });

  it("reports the same kind and name at the same spot", () => {
    expect(
      findDuplicates([at("bar-002", "The Rusty Anchor", 441.9), at("food-002", "The Rusty Anchor", 441.6)]),
    ).toEqual(['bar-002 and food-002 ("The Rusty Anchor")']);
  });

  it("ignores the same name further apart, a different kind, or a generic name", () => {
    expect(findDuplicates([at("a", "Conch King", 100), at("b", "Conch King", 105)])).toEqual([]);
    expect(findDuplicates([at("a", "Fleeca Field", 100, "building"), at("b", "Fleeca Field", 100, "waink")])).toEqual(
      [],
    );
    const atms = [1, 2, 3, 4].map((n) => at(`atm-${n}`, "ATM", 100 + n / 10, "shop"));
    expect(findDuplicates(atms)).toEqual([]);
  });

  it("reports a duplicate in a fixture through validateData", () => {
    const root = fixture({
      "data/places.json": [
        { id: "L1", kind: "food", name: "Hank's Waffles", x: 10, y: 10 },
        { id: "L2", kind: "food", name: "Hank's Waffles", x: 10.2, y: 10 },
      ],
    });
    expect(validateData(root).join()).toContain("L1 and L2");
  });
});
