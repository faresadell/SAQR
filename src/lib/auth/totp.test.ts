import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, otpauthUri, totpAt, verifyTotp } from "./totp";

// RFC 6238 appendix B test secret (ASCII "12345678901234567890").
const RFC_SECRET = Buffer.from("12345678901234567890");

describe("totp", () => {
  it("matches the RFC 6238 test vectors (last 6 digits)", () => {
    expect(totpAt(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpAt(RFC_SECRET, Math.floor(1234567890 / 30))).toBe("005924");
  });

  it("round-trips base32", () => {
    expect(base32Encode(RFC_SECRET)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").equals(RFC_SECRET)).toBe(true);
  });

  it("accepts the current code and returns its step", () => {
    const now = 1_234_567_890_000;
    expect(verifyTotp(RFC_SECRET, "005924", now, null)).toBe(Math.floor(1234567890 / 30));
  });

  it("rejects a replayed step and wrong or malformed codes", () => {
    const now = 1_234_567_890_000;
    const step = Math.floor(1234567890 / 30);
    expect(verifyTotp(RFC_SECRET, "005924", now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "000000", now, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", now, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", now, null)).toBeNull();
  });

  it("tolerates one step of clock drift but not two", () => {
    const now = 1_234_567_890_000;
    const previous = totpAt(RFC_SECRET, Math.floor(1234567890 / 30) - 1);
    const tooOld = totpAt(RFC_SECRET, Math.floor(1234567890 / 30) - 2);
    expect(verifyTotp(RFC_SECRET, previous, now, null)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, tooOld, now, null)).toBeNull();
  });

  it("builds an otpauth URI", () => {
    expect(otpauthUri("admin", RFC_SECRET)).toContain("otpauth://totp/SAQR:admin?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });
});
