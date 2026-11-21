import { describe, expect, it } from "vitest";
import { sameJson } from "./sync-wiki.ts";

describe("sameJson", () => {
  it("treats re-indented JSON as unchanged, so the wiki isn't edited for formatting", () => {
    expect(sameJson('{\n\t"a": [1, 2]\n}', '{"a":[1,2]}')).toBe(true);
  });

  it("sees a changed value, a missing page, or unparsable content as needing an edit", () => {
    expect(sameJson('{"a":[1,2]}', '{"a":[1,3]}')).toBe(false);
    expect(sameJson(undefined, '{"a":1}')).toBe(false);
    expect(sameJson("not json", '{"a":1}')).toBe(false);
  });
});
