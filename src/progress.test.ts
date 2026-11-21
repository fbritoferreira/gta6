import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checksum, decodeProgress, encodeProgress, trackableIds } from "./progress";

const ids = ["bank-001", "card-001", "card-002", "package-001", "safe-001"];

describe("progress links", () => {
  it("round-trips a found list", () => {
    const found = new Set(["card-002", "safe-001"]);
    const decoded = decodeProgress(encodeProgress(found, ids), ids);
    expect(decoded).toEqual({ ok: true, found });
  });

  it("uses URL-safe characters only", () => {
    const code = encodeProgress(new Set(ids), ids);
    expect(code).toMatch(/^[a-z0-9]{6}\.[a-z0-9]+\.[A-Za-z0-9_-]+$/);
  });

  it("still reads after the data sync appends new locations; they start unfound", () => {
    const found = new Set(["card-001", "safe-001"]);
    const code = encodeProgress(found, ids);
    expect(decodeProgress(code, [...ids, "meteorite-019", "card-003"])).toEqual({ ok: true, found });
  });

  it("recognises a link whose earlier entries changed instead of misreading it", () => {
    const code = encodeProgress(new Set(["card-001"]), ids);
    const refiled = ["bank-001", "card-001", "card-002", "card-009", "package-001", "safe-001"];
    expect(decodeProgress(code, refiled)).toEqual({ ok: false, reason: "outdated" });
    expect(decodeProgress(code, ids.slice(0, 3))).toEqual({ ok: false, reason: "outdated" });
  });

  it("still reads links in the first format (sorted ids, whole-list checksum)", () => {
    const shuffled = ["safe-001", "card-002", "bank-001", "package-001", "card-001"];
    const [sum, , bits] = encodeProgress(new Set(["card-002"]), ids).split("."); // ids is already sorted
    expect(decodeProgress(`${sum}.${bits}`, shuffled)).toEqual({ ok: true, found: new Set(["card-002"]) });
    expect(decodeProgress(`${sum}.${bits}`, [...shuffled, "card-003"])).toEqual({ ok: false, reason: "outdated" });
  });

  it("rejects a damaged link", () => {
    expect(decodeProgress("nonsense", ids)).toEqual({ ok: false, reason: "invalid" });
    expect(decodeProgress(`${checksum(ids)}.A`, ids)).toEqual({ ok: false, reason: "invalid" });
    expect(decodeProgress(`${checksum(ids)}.zz!.AA`, ids)).toEqual({ ok: false, reason: "invalid" });
    expect(decodeProgress(`${checksum(ids)}.5.A`, ids)).toEqual({ ok: false, reason: "invalid" });
  });

  // Grows with the data, so check the rate (one character per 6 locations), not a fixed cap that
  // every data sync would eventually break.
  it("costs one character per 6 trackable locations, plus a short header", () => {
    const categories = JSON.parse(readFileSync("public/data/categories.json", "utf8")) as {
      kinds: { key: string; pinnable: boolean }[];
    };
    const trackable = new Set(categories.kinds.filter((k) => k.pinnable).map((k) => k.key));
    const items = [
      ...(JSON.parse(readFileSync("public/data/locations.json", "utf8")) as { id: string; kind: string }[]),
      ...(JSON.parse(readFileSync("public/data/places.json", "utf8")) as { id: string; kind: string }[]),
    ];
    const all = trackableIds(items, (k) => trackable.has(k));
    expect(encodeProgress(new Set(all), all).length).toBeLessThanOrEqual(7 + 4 + Math.ceil(all.length / 6) + 1);
    expect(all.length).toBeGreaterThan(1000); // the real data, not an empty read
  });
});
