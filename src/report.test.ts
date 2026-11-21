import { describe, expect, it } from "vitest";
import type { District } from "./data";
import { districtAt, missingLocationUrl, screenshotUrl, toGame, wrongLocationUrl } from "./report";

const square = (name: string, x0: number, y0: number, size: number): District => ({
  name,
  x: x0 + size / 2,
  y: y0 + size / 2,
  rings: [
    [
      [x0, y0],
      [x0 + size, y0],
      [x0 + size, y0 + size],
      [x0, y0 + size],
      [x0, y0],
    ],
  ],
});
const districts = [square("Vice City", 100, 100, 50), square("Hamlet", 200, 200, 20)];

describe("toGame", () => {
  it("inverts the README formula", () => {
    expect(toGame(512, 512)).toEqual({ gx: 0, gy: 0 });
    expect(toGame((1000 + 16384) / 32, (16384 - -2000) / 32)).toEqual({ gx: 1000, gy: -2000 });
  });
});

describe("districtAt", () => {
  it("finds the district whose outline contains the point", () => {
    expect(districtAt(120, 130, districts)).toBe("Vice City");
    expect(districtAt(210, 210, districts)).toBe("Hamlet");
  });

  it("returns undefined outside every district", () => {
    expect(districtAt(10, 10, districts)).toBeUndefined();
    expect(districtAt(175, 175, districts)).toBeUndefined();
  });
});

describe("issue links", () => {
  it("pre-fill the missing-location form with position, game coordinates and district", () => {
    const url = new URL(missingLocationUrl(512, 512, "Vice City"));
    expect(url.pathname).toMatch(/\/issues\/new$/);
    expect(url.searchParams.get("template")).toBe("missing-location.yml");
    expect(url.searchParams.get("position")).toBe("x 512.0, y 512.0");
    expect(url.searchParams.get("game-coords")).toBe("X 0, Y 0");
    expect(url.searchParams.get("district")).toBe("Vice City");
  });

  it("leave out a district the point isn't in", () => {
    expect(new URL(missingLocationUrl(1, 1)).searchParams.has("district")).toBe(false);
  });

  it("pre-fill the wrong-location form with the id and name", () => {
    const url = new URL(wrongLocationUrl({ id: "bank-001", name: "Vice City Bank & Trust" }));
    expect(url.searchParams.get("template")).toBe("wrong-location.yml");
    expect(url.searchParams.get("location-id")).toBe("bank-001");
    expect(url.searchParams.get("title")).toBe("Wrong: Vice City Bank & Trust");
  });
});

describe("districtAt on the real outlines", () => {
  it("puts each district's label point inside that district", async () => {
    const { readFileSync } = await import("node:fs");
    const real = JSON.parse(readFileSync("public/data/districts.json", "utf8")) as District[];
    for (const d of real) expect(districtAt(d.x, d.y, real), d.name).toBe(d.name);
  });
});

describe("screenshotUrl", () => {
  it("opens the screenshot form set to add or replace, with the id and name filled in", () => {
    const add = new URL(screenshotUrl({ id: "waink-landmark-014", name: "Gellhorn Fun Fair", screenshot: null }));
    expect(add.searchParams.get("template")).toBe("screenshot.yml");
    expect(add.searchParams.get("location-id")).toBe("waink-landmark-014");
    expect(add.searchParams.get("action")).toBe("Add (it has no screenshot)");
    const replace = new URL(screenshotUrl({ id: "x-1", name: "X", screenshot: "screenshots/x-1.webp" }));
    expect(replace.searchParams.get("action")).toBe("Replace the current one");
  });
});
