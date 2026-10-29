import { describe, expect, it } from "vitest";
import { generateOtp, hashOtp, otpMatches } from "./otp";

describe("otp", () => {
  it("generates 6-digit numeric codes", () => {
    for (let i = 0; i < 200; i++) expect(/^\d{6}$/.test(generateOtp())).toBe(true);
  });

  it("matches only the same secret, phone, purpose and code", () => {
    const base = hashOtp("secret-secret-secret-secret-123456", "+201012345678", "SIGNUP", "123456");
    expect(otpMatches(base, hashOtp("secret-secret-secret-secret-123456", "+201012345678", "SIGNUP", "123456"))).toBe(true);
    expect(otpMatches(base, hashOtp("secret-secret-secret-secret-123456", "+201012345678", "SIGNUP", "123457"))).toBe(false);
    expect(otpMatches(base, hashOtp("secret-secret-secret-secret-123456", "+201012345679", "SIGNUP", "123456"))).toBe(false);
    expect(otpMatches(base, hashOtp("secret-secret-secret-secret-123456", "+201012345678", "LOGIN", "123456"))).toBe(false);
    expect(otpMatches(base, hashOtp("other-secret-other-secret-other-12", "+201012345678", "SIGNUP", "123456"))).toBe(false);
  });

  it("never matches malformed hashes", () => {
    expect(otpMatches("", "")).toBe(false);
    expect(otpMatches("zz", "zz")).toBe(false);
  });
});
