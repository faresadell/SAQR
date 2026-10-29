import { describe, expect, it } from "vitest";
import { normalizeEgyptPhone } from "./phone";

describe("normalizeEgyptPhone", () => {
  it("normalizes common Egyptian formats to E.164", () => {
    for (const input of ["01012345678", "+201012345678", "201012345678", "00201012345678", "010 1234 5678", "0101-234-5678"]) {
      expect(normalizeEgyptPhone(input)).toBe("+201012345678");
    }
  });

  it("accepts Arabic-Indic digits", () => {
    expect(normalizeEgyptPhone("٠١٢٢٣٤٥٦٧٨٩")).toBe("+201223456789");
  });

  it("accepts all four mobile prefixes", () => {
    for (const p of ["010", "011", "012", "015"]) expect(normalizeEgyptPhone(`${p}12345678`)).toBe(`+20${p.slice(1)}12345678`);
  });

  it("rejects invalid numbers", () => {
    for (const bad of ["", "0131234567", "01312345678", "0101234567", "010123456789", "abc", "+14155550100", "0225781234"]) {
      expect(normalizeEgyptPhone(bad)).toBeNull();
    }
  });
});
