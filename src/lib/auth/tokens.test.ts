import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken } from "./tokens";

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
