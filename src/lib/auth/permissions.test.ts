import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions";

describe("hasPermission", () => {
  it("gives the super admin every permission", () => {
    expect(hasPermission({ role: "ADMIN", isSuperAdmin: true, permissions: [] }, "settings.manage")).toBe(true);
  });

  it("gives sub-admins only what they were granted", () => {
    const support = { role: "ADMIN" as const, isSuperAdmin: false, permissions: ["users.view"] };
    expect(hasPermission(support, "users.view")).toBe(true);
    expect(hasPermission(support, "users.manage")).toBe(false);
  });

  it("never grants permissions to non-admin roles, even with stray data", () => {
    for (const role of ["CUSTOMER", "MERCHANT", "DRIVER"] as const) {
      expect(hasPermission({ role, isSuperAdmin: true, permissions: ["users.manage"] }, "users.manage")).toBe(false);
    }
  });
});
