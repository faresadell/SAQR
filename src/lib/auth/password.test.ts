import { describe, expect, it } from "vitest";
import { checkPasswordStrength, hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse 42");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse 42", hash)).toBe(true);
    expect(await verifyPassword("correct horse 43", hash)).toBe(false);
  });

  it("uses a fresh salt every time", async () => {
    expect(await hashPassword("same-password-1")).not.toBe(await hashPassword("same-password-1"));
  });

  it("rejects malformed or tampered hashes without throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$1$1$a$b")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$a$b$c$d$e")).toBe(false);
  });
});

describe("checkPasswordStrength", () => {
  it("flags weak passwords", () => {
    expect(checkPasswordStrength("short1")).toBe("TOO_SHORT");
    expect(checkPasswordStrength("12345678901")).toBe("ALL_DIGITS");
    expect(checkPasswordStrength("Password")).toBe("COMMON");
    expect(checkPasswordStrength("a".repeat(129))).toBe("TOO_LONG");
    expect(checkPasswordStrength("+201012345678", "+201012345678")).toBe("SAME_AS_PHONE");
  });

  it("accepts a reasonable password", () => {
    expect(checkPasswordStrength("falcon-Nile-2026")).toBeNull();
  });
});
