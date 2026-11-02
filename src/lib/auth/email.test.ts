import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("lower-cases and trims valid addresses", () => expect(normalizeEmail("  User.Name+x@Example.COM ")).toBe("user.name+x@example.com"));
  it("rejects malformed values", () => {
    for (const bad of ["", "a@b", "no-at.com", "a b@c.com", "a@@c.com", "@c.com", `${"a".repeat(65)}@c.com`, 5, null, "a@c.c"]) expect(normalizeEmail(bad)).toBeNull();
  });
});
