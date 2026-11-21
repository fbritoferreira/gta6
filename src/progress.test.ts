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
    expect(code).toMatch(/^[a-z0-9]{6}\.[A-Za-z0-9_-]+$/);
  });

  it("recognises a link made from different map data instead of misreading it", () => {
    const code = encodeProgress(new Set(["card-001"]), ids);
    expect(decodeProgress(code, [...ids, "card-003"])).toEqual({ ok: false, reason: "outdated" });
  });

  it("rejects a damaged link", () => {
    expect(decodeProgress("nonsense", ids)).toEqual({ ok: false, reason: "invalid" });
    expect(decodeProgress(`${checksum(ids)}.A`, ids)).toEqual({ ok: false, reason: "invalid" });
  });

  // Grows with the data, so check the rate (one character per 6 locations), not a fixed cap that
  // every data sync would eventually break.
  it("costs one character per 6 trackable locations, plus a 7-character header", () => {
    const categories = JSON.parse(readFileSync("public/data/categories.json", "utf8")) as {
      kinds: { key: string; pinnable: boolean }[];
    };
    const trackable = new Set(categories.kinds.filter((k) => k.pinnable).map((k) => k.key));
    const items = [
      ...(JSON.parse(readFileSync("public/data/locations.json", "utf8")) as { id: string; kind: string }[]),
      ...(JSON.parse(readFileSync("public/data/places.json", "utf8")) as { id: string; kind: string }[]),
    ];
    const all = trackableIds(items, (k) => trackable.has(k));
    expect(encodeProgress(new Set(all), all).length).toBeLessThanOrEqual(7 + Math.ceil(all.length / 6) + 1);
    expect(all.length).toBeGreaterThan(1000); // the real data, not an empty read
  });
});
