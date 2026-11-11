import { describe, expect, it } from "vitest";
import { generateSessionToken, generateSignupNonce, hashSessionToken, hashSignupNonce, signupNonceMatches } from "./tokens";

describe("session tokens", () => {
  it("are long, unique and URL-safe", () => {
    const a = generateSessionToken();
    expect(a.length >= 43).toBe(true);
    expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true);
    expect(a).not.toBe(generateSessionToken());
  });

  it("hash deterministically and never equal the token", () => {
    const t = generateSessionToken();
    expect(hashSessionToken(t)).toBe(hashSessionToken(t));
    expect(hashSessionToken(t)).not.toBe(t);
    expect(hashSessionToken(t).length).toBe(64);
  });
});

describe("signup nonce", () => {
  it("is long and unique, and only its hash is meant to be stored", () => {
    const a = generateSignupNonce();
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).not.toBe(generateSignupNonce());
    expect(hashSignupNonce(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSignupNonce(a)).not.toContain(a);
  });

  it("matches only the nonce it was made from", () => {
    const a = generateSignupNonce();
    const b = generateSignupNonce();
    expect(signupNonceMatches(hashSignupNonce(a), a)).toBe(true);
    expect(signupNonceMatches(hashSignupNonce(a), b)).toBe(false);
  });

  it("never matches when nothing is stored or the stored value is malformed", () => {
    const a = generateSignupNonce();
    expect(signupNonceMatches(null, a)).toBe(false);
    expect(signupNonceMatches(undefined, a)).toBe(false);
    expect(signupNonceMatches("", a)).toBe(false);
    expect(signupNonceMatches("zz", a)).toBe(false);
  });

  it("is not interchangeable with a session-token hash", () => {
    const a = generateSignupNonce();
    expect(hashSignupNonce(a)).not.toBe(hashSessionToken(a));
  });
});
