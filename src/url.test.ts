import { describe, expect, it } from "vitest";
import { readUrl, writeUrl } from "./url";

const known = new Set(["card", "bank", "shop"]);
const defaults = ["card", "bank"];

describe("readUrl", () => {
  it("falls back to defaults for an empty query", () => {
    const r = readUrl("", known, defaults);
    expect(r.filters).toEqual({ style: "night", kinds: new Set(defaults), labels: true, hideFound: false });
    expect(r.view).toBeUndefined();
    expect(r.embed).toBe(false);
  });

  it("reads every parameter", () => {
    const r = readUrl(
      "?style=day&kinds=shop&labels=0&hidefound=1&view=3/500.5/480&id=bank-001&embed=1",
      known,
      defaults,
    );
    expect(r.filters).toEqual({ style: "day", kinds: new Set(["shop"]), labels: false, hideFound: true });
    expect(r.view).toEqual({ zoom: 3, x: 500.5, y: 480 });
    expect(r.id).toBe("bank-001");
    expect(r.embed).toBe(true);
  });

  it("drops unknown kinds and ignores a malformed view", () => {
    const r = readUrl("?kinds=card,nope&view=3/abc", known, defaults);
    expect(r.filters.kinds).toEqual(new Set(["card"]));
    expect(r.view).toBeUndefined();
  });

  it("treats an empty kinds list as 'show nothing', not as defaults", () => {
    expect(readUrl("?kinds=", known, defaults).filters.kinds.size).toBe(0);
  });
});

describe("writeUrl", () => {
  it("writes nothing for the default state", () => {
    const f = readUrl("", known, defaults).filters;
    expect(writeUrl(f, defaults).toString()).toBe("");
  });

  it("round-trips through readUrl", () => {
    const query = "?style=day&kinds=shop&labels=0&hidefound=1&view=2.5/12.3/45.6";
    const r = readUrl(query, known, defaults);
    const again = readUrl(`?${writeUrl(r.filters, defaults, r.view)}`, known, defaults);
    expect(again.filters).toEqual(r.filters);
    expect(again.view).toEqual(r.view);
  });

  it("ignores kind order when comparing with the defaults", () => {
    const f = { style: "night" as const, kinds: new Set(["bank", "card"]), labels: true, hideFound: false };
    expect(writeUrl(f, defaults).has("kinds")).toBe(false);
  });
});

describe("kinds as defaults plus changes", () => {
  const many = new Set(["a", "b", "c", "d", "e", "hotel"]);
  const base = ["a", "b", "c", "d", "e"];

  it("reads default plus additions and removals", () => {
    expect(readUrl("?kinds=default,hotel,-a", many, base).filters.kinds).toEqual(
      new Set(["b", "c", "d", "e", "hotel"]),
    );
  });

  it("writes whichever form is shorter", () => {
    const plusHotel = readUrl("?kinds=default,hotel", many, base).filters;
    expect(writeUrl(plusHotel, base).get("kinds")).toBe("default,hotel");
    const justA = readUrl("?kinds=a", many, base).filters;
    expect(writeUrl(justA, base).get("kinds")).toBe("a");
  });

  it("round-trips", () => {
    const f = readUrl("?kinds=default,-c,hotel", many, base).filters;
    expect(readUrl(`?${writeUrl(f, base)}`, many, base).filters.kinds).toEqual(f.kinds);
  });
});
