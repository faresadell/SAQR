import { describe, expect, it } from "vitest";
import { validateBusinessTypeInput, validateCategoryInput, validateMerchantInput } from "./merchant-input";

const ok = { name: "مطعم الصقر", businessType: "restaurant" };

describe("validateMerchantInput", () => {
  it("accepts a minimal profile and an optional phone/location", () => {
    expect(validateMerchantInput(ok).ok).toBe(true);
    const r = validateMerchantInput({ ...ok, phone: "01012345678", lat: "30.0444", lng: "31.2357", address: "وسط البلد" });
    expect(r.ok && r.value.phone === "+201012345678" && r.value.lat === 30.0444).toBe(true);
  });

  it("rejects bad names, types, phones and half-filled or out-of-range coordinates", () => {
    expect(validateMerchantInput({ ...ok, name: "a" }).ok).toBe(false);
    expect(validateMerchantInput({ ...ok, businessType: "Bad Type!" }).ok).toBe(false);
    expect(validateMerchantInput({ ...ok, businessType: "" }).ok).toBe(false);
    expect(validateMerchantInput({ ...ok, phone: "123" }).ok).toBe(false);
    expect(validateMerchantInput({ ...ok, lat: "30" }).ok).toBe(false);
    expect(validateMerchantInput({ ...ok, lat: "95", lng: "31" }).ok).toBe(false);
    expect(validateMerchantInput({ ...ok, lat: "abc", lng: "31" }).ok).toBe(false);
  });
});

describe("validateCategoryInput", () => {
  it("accepts names and an optional order", () => {
    const r = validateCategoryInput({ nameAr: "مشويات", sortOrder: "٣" });
    expect(r.ok && r.value.sortOrder === 3 && r.value.nameEn === null).toBe(true);
  });

  it("rejects short names and bad order", () => {
    expect(validateCategoryInput({ nameAr: "م" }).ok).toBe(false);
    expect(validateCategoryInput({ nameAr: "مشويات", sortOrder: "-1" }).ok).toBe(false);
    expect(validateCategoryInput({ nameAr: "مشويات", sortOrder: "10000" }).ok).toBe(false);
  });
});

describe("validateBusinessTypeInput", () => {
  it("accepts a code and name; rejects unsafe codes", () => {
    expect(validateBusinessTypeInput({ code: "restaurant", nameAr: "مطعم" }).ok).toBe(true);
    for (const code of ["", "R", "Rest", "1abc", "a-b", "a b", "x".repeat(31)]) {
      expect(validateBusinessTypeInput({ code, nameAr: "مطعم" }).ok).toBe(false);
    }
  });
});
