import { describe, expect, it } from "vitest";
import { canEditOwnProfile, canManageOwnCatalog } from "./catalog-policy";

const owner = { id: "m1", role: "MERCHANT" as const, isSuperAdmin: false, permissions: [] as string[] };
const shop = (status: string) => ({ ownerId: "m1", status });

describe("canManageOwnCatalog", () => {
  it("allows only the owner of an approved merchant", () => {
    expect(canManageOwnCatalog(owner, shop("APPROVED"))).toBe(true);
  });

  it("blocks other merchants (IDOR), customers, drivers and even super admins", () => {
    expect(canManageOwnCatalog({ ...owner, id: "m2" }, shop("APPROVED"))).toBe(false);
    expect(canManageOwnCatalog({ ...owner, role: "CUSTOMER" }, shop("APPROVED"))).toBe(false);
    expect(canManageOwnCatalog({ ...owner, role: "DRIVER" }, shop("APPROVED"))).toBe(false);
    expect(canManageOwnCatalog({ ...owner, role: "ADMIN", isSuperAdmin: true }, shop("APPROVED"))).toBe(false);
  });

  it("blocks unapproved, rejected and suspended merchants", () => {
    for (const status of ["PENDING_REVIEW", "REJECTED", "SUSPENDED"]) expect(canManageOwnCatalog(owner, shop(status))).toBe(false);
  });
});

describe("canEditOwnProfile", () => {
  it("allows pending and approved, blocks rejected, suspended and others", () => {
    expect(canEditOwnProfile(owner, shop("PENDING_REVIEW"))).toBe(true);
    expect(canEditOwnProfile(owner, shop("APPROVED"))).toBe(true);
    expect(canEditOwnProfile(owner, shop("REJECTED"))).toBe(false);
    expect(canEditOwnProfile(owner, shop("SUSPENDED"))).toBe(false);
    expect(canEditOwnProfile({ ...owner, id: "x" }, shop("APPROVED"))).toBe(false);
  });
});
