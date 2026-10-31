import { describe, expect, it } from "vitest";
import { arabicCount, starsLabel } from "./format";

describe("starsLabel", () => {
  it("uses the right Arabic plural form", () => {
    expect(starsLabel(1)).toBe("نجمة واحدة");
    expect(starsLabel(2)).toBe("نجمتان");
    expect(starsLabel(5)).toContain("نجوم");
    expect(starsLabel(11)).toContain("نجمة");
    expect(starsLabel(0)).toContain("نجمة");
  });
});

describe("arabicCount", () => {
  it("keeps numbers for few and many forms", () => {
    expect(arabicCount(3, { one: "a", two: "b", few: "c", many: "d" })).toMatch(/ c$/);
    expect(arabicCount(40, { one: "a", two: "b", few: "c", many: "d" })).toMatch(/ d$/);
  });
});
