import { describe, expect, it } from "vitest";
import { mergePlaces } from "./merge";

const shop = { id: "clothing-001", name: "Binco", x: 501.5, y: 456.8 };
const place = { id: "L1488", name: "Binco", x: 501.7, y: 456.8, area: "Little Havana", real_life: "Ross, 8th St" };

describe("mergePlaces", () => {
  it("folds a place into the location at the same spot, keeping both sets of details", () => {
    const { items, merged } = mergePlaces([shop], [place]);
    expect(items).toEqual([{ ...shop, area: "Little Havana", real_life: "Ross, 8th St" }]);
    expect(merged.get("L1488")).toBe("clothing-001");
  });

  it("keeps places that are elsewhere or named differently", () => {
    const far = { ...place, id: "L2", x: 520 };
    const other = { ...place, id: "L3", name: "SubUrban" };
    expect(mergePlaces([shop], [far, other]).items.map((i) => i.id)).toEqual(["L2", "L3", "clothing-001"]);
  });

  it("picks the nearest of two same-named locations", () => {
    const near = { ...shop, id: "marina-004", x: 501.7 };
    expect(mergePlaces([shop, near], [place]).merged.get("L1488")).toBe("marina-004");
  });

  it("does not change the input", () => {
    mergePlaces([shop], [place]);
    expect(shop).not.toHaveProperty("real_life");
  });
});
