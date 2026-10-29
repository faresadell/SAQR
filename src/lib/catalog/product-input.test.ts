import { describe, expect, it } from "vitest";
import { cleanText, validateProductInput } from "./product-input";

const ok = { name: "شاورما فراخ", description: "وجبة", price: "85.50", categoryId: "cat1" };

describe("validateProductInput", () => {
  it("stores the price as integer piasters", () => {
    const r = validateProductInput(ok);
    expect(r.ok && r.value.priceCents === 8550).toBe(true);
  });

  it("accepts Arabic digits and comma decimals", () => {
    const r = validateProductInput({ ...ok, price: "٨٥,٥" });
    expect(r.ok && r.value.priceCents === 8550).toBe(true);
  });

  it("rejects zero, negative, too large and malformed prices", () => {
    for (const price of ["", "0", "0.00", "-5", "100000.01", "abc", "1.234", "1e3"]) {
      const r = validateProductInput({ ...ok, price });
      expect(!r.ok && r.errors.price !== undefined).toBe(true);
    }
  });

  it("accepts the 0.01 and 100000 boundaries", () => {
    expect(validateProductInput({ ...ok, price: "0.01" }).ok).toBe(true);
    expect(validateProductInput({ ...ok, price: "100000" }).ok).toBe(true);
  });

  it("requires a name and a category, and limits lengths", () => {
    expect(validateProductInput({ ...ok, name: "a" }).ok).toBe(false);
    expect(validateProductInput({ ...ok, name: "x".repeat(121) }).ok).toBe(false);
    expect(validateProductInput({ ...ok, categoryId: "" }).ok).toBe(false);
    expect(validateProductInput({ ...ok, description: "x".repeat(1001) }).ok).toBe(false);
  });

  it("defaults to available and keeps an empty description as null", () => {
    const r = validateProductInput({ ...ok, description: "  " });
    expect(r.ok && r.value.isAvailable === true && r.value.description === null).toBe(true);
  });
});

describe("cleanText", () => {
  it("collapses whitespace and removes control characters", () => {
    expect(cleanText("  a\u0000b \n\t c  ")).toBe("a b c");
  });
});
