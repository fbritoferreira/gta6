import { describe, expect, it } from "vitest";
import { buildIndex, normalize, search, type Searchable } from "./search";

const items: Searchable[] = [
  {
    id: "L1",
    kind: "hotel",
    name: "Vice Regal",
    area: "Washington Beach, Vice Beach",
    district: "Vice Beach",
    real_life: "The Ritz-Carlton Bal Harbour",
  },
  {
    id: "hidden-package-001",
    kind: "card",
    name: "Los Santos Panic card: Marquise Bernard",
    type: "Los Santos Panic card",
    district: "Key Lento",
  },
  { id: "fleeca-002", kind: "bank", name: "Fleeca - Key Lento", type: "Bank", district: "Key Lento" },
  { id: "bank-009", kind: "bank", name: "Keystone Savings", type: "Bank", district: "Vice City" },
  { id: "treasure-005", kind: "treasure", name: "Nuestra Señora Lujuriosa Treasure", district: "Key Lento" },
];
const categories = [
  { kind: "card", name: "Collectible cards" },
  { kind: "bank", name: "Banks and vaults" },
  { kind: "treasure", name: "Treasures" },
];
const names: Record<string, string> = {
  hotel: "Hotels",
  card: "Collectible cards",
  bank: "Banks and vaults",
  treasure: "Treasures",
};
const index = buildIndex(items, (k) => names[k]);
const find = (q: string) => search(index, q, ["Vice City", "Vice Beach", "Key Lento"], categories);

describe("search", () => {
  it("finds a place by the real-world place it is based on", () => {
    expect(find("ritz").items.map((i) => i.id)).toEqual(["L1"]);
  });

  it("offers the district itself, with how many locations are in it", () => {
    expect(find("key lento").districts).toEqual([{ name: "Key Lento", count: 3 }]);
  });

  it("matches every word anywhere, so 'card key lento' finds cards in Key Lento", () => {
    expect(find("card key lento").items.map((i) => i.id)).toEqual(["hidden-package-001"]);
  });

  it("offers a category to show on its own", () => {
    expect(find("bank").categories).toEqual([{ kind: "bank", name: "Banks and vaults", count: 2 }]);
  });

  it("ranks names that start with the query first", () => {
    expect(find("key").items[0].id).toBe("bank-009");
  });

  it("ignores accents and punctuation", () => {
    expect(find("senora").items.map((i) => i.id)).toEqual(["treasure-005"]);
    expect(normalize("Pay 'n' Spray")).toBe("pay n spray");
  });

  it("returns nothing for one character, and counts what it left out", () => {
    expect(find("k").items).toEqual([]);
    expect(search(index, "e", [], []).items).toEqual([]);
    expect(search(index, "key lento", [], [], 1)).toMatchObject({ more: 2 });
  });
});
