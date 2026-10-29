import { describe, expect, it } from "vitest";
import { canViewReceipt } from "./receipt-access";

const order = { customerId: "c1", merchantOwnerId: "m1" };
const base = { isSuperAdmin: false, permissions: [] as string[] };

describe("canViewReceipt", () => {
  it("lets the order's customer and merchant owner in", () => {
    expect(canViewReceipt({ ...base, id: "c1", role: "CUSTOMER" }, order)).toBe(true);
    expect(canViewReceipt({ ...base, id: "m1", role: "MERCHANT" }, order)).toBe(true);
  });

  it("blocks other customers, other merchants and drivers", () => {
    expect(canViewReceipt({ ...base, id: "c2", role: "CUSTOMER" }, order)).toBe(false);
    expect(canViewReceipt({ ...base, id: "m2", role: "MERCHANT" }, order)).toBe(false);
    expect(canViewReceipt({ ...base, id: "d1", role: "DRIVER" }, order)).toBe(false);
    // role mix-up: a merchant id presented as a customer must not pass
    expect(canViewReceipt({ ...base, id: "m1", role: "CUSTOMER" }, order)).toBe(false);
  });

  it("lets only admins with payments.review in", () => {
    expect(canViewReceipt({ ...base, id: "a1", role: "ADMIN", permissions: ["payments.review"] }, order)).toBe(true);
    expect(canViewReceipt({ ...base, id: "a2", role: "ADMIN", permissions: ["users.view"] }, order)).toBe(false);
    expect(canViewReceipt({ ...base, id: "a3", role: "ADMIN", isSuperAdmin: true }, order)).toBe(true);
  });
});
