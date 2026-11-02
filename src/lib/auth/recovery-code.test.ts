import { describe, expect, it } from "vitest";
import { generateRecoveryCode, hashRecoveryCode, normalizeRecoveryCode } from "./recovery-code";

describe("recovery codes", () => {
  it("generates well-formed, distinct codes", () => {
    const codes = new Set(Array.from({ length: 200 }, generateRecoveryCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
  });
  it("normalizes case, spaces and dash; rejects look-alike or short input", () => {
    expect(normalizeRecoveryCode(" k7qm2 x9tda ")).toBe("K7QM2-X9TDA");
    expect(normalizeRecoveryCode("K7QM2X9TDA")).toBe("K7QM2-X9TDA");
    for (const bad of ["K7QM2-X9TD", "K7QM2-X9TDO", "K7QM2-X9TD1", "", 5, null]) expect(normalizeRecoveryCode(bad)).toBeNull();
  });
  it("hash depends on the owner and the secret", () => {
    const a = hashRecoveryCode("s".repeat(32), "u1", "K7QM2-X9TDA");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode("s".repeat(32), "u2", "K7QM2-X9TDA")).not.toBe(a);
    expect(hashRecoveryCode("t".repeat(32), "u1", "K7QM2-X9TDA")).not.toBe(a);
  });
});
