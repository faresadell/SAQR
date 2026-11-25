/** Admin: add merchant / customer, delete accounts, adjust stars (real PostgreSQL). WARNING: it TRUNCATES tables. Use a throwaway database. */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authenticate } from "@/server/auth/auth-service";
import type { SessionUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/errors";
import { createCustomerByAdmin, createMerchantByAdmin } from "@/server/users/create-account";
import { deleteUserByAdmin } from "@/server/users/service";
import { adjustStarsByAdmin } from "@/server/stars/admin-adjust";
import { applyStarMove, getStarBalance } from "@/server/stars/ledger";

process.env.APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "s".repeat(48);
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const merchantInput = { name: "صاحب نشاط", phone: "01022223333", email: "Shop@Example.com", password: "Sturdy-pass-91", shopName: "مطعم الصقر", businessType: "restaurant" };
const customerInput = { name: "عميل جديد", phone: "01044445555", email: "cust@example.com", password: "Sturdy-pass-91" };

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "RateLimitHit","Session","AuditLog","StarLedgerEntry","StarAccount","Merchant","BusinessType","AdminPermission","User" RESTART IDENTITY CASCADE');
  await db.businessType.create({ data: { code: "restaurant", nameAr: "مطعم" } });
});

async function makeAdmin(superAdmin = true): Promise<SessionUser> {
  const user = await db.user.create({ data: { phone: "+201000000001", email: "admin@example.com", name: "Admin", passwordHash: "x", role: "ADMIN", status: "ACTIVE", isSuperAdmin: superAdmin } });
  return { user: { ...user, permissions: [] } } as unknown as SessionUser;
}

describe("admin opens merchant and customer accounts", () => {
  it("creates an active merchant with an approved shop who can sign in, and a customer", async () => {
    const admin = await makeAdmin();
    const m = await createMerchantByAdmin(admin, merchantInput, "unknown");
    expect(m.ok).toBe(true);
    const owner = await db.user.findUniqueOrThrow({ where: { email: "shop@example.com" }, include: { merchant: true } });
    expect(owner).toMatchObject({ role: "MERCHANT", status: "ACTIVE" });
    expect(owner.merchant).toMatchObject({ name: "مطعم الصقر", status: "APPROVED", businessType: "restaurant" });
    expect((await authenticate({ email: "shop@example.com", password: merchantInput.password }, "unknown")).ok).toBe(true);
    expect((await createCustomerByAdmin(admin, customerInput, "unknown")).ok).toBe(true);
    expect(await db.user.count({ where: { role: "CUSTOMER", status: "ACTIVE" } })).toBe(1);
  });

  it("refuses duplicates, bad business types and non-admins", async () => {
    const admin = await makeAdmin();
    await createMerchantByAdmin(admin, merchantInput, "unknown");
    expect(await createMerchantByAdmin(admin, { ...merchantInput, email: "o@example.com" }, "unknown")).toEqual({ ok: false, error: "PHONE_TAKEN" });
    expect(await createMerchantByAdmin(admin, { ...merchantInput, phone: "01055556666", email: "t@example.com", businessType: "nope" }, "unknown")).toEqual({ ok: false, error: "INVALID_BUSINESS_TYPE" });
    const customer = { user: { id: "c", role: "CUSTOMER", isSuperAdmin: false, permissions: [] } } as unknown as SessionUser;
    await expect(createMerchantByAdmin(customer, merchantInput, "unknown")).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("admin deletes accounts", () => {
  it("removes an account with no history completely and frees the phone and email", async () => {
    const admin = await makeAdmin();
    const c = await createCustomerByAdmin(admin, customerInput, "unknown");
    if (!c.ok) throw new Error("setup");
    await db.starAccount.deleteMany({ where: { userId: c.userId } });
    expect(await deleteUserByAdmin(admin, c.userId, "طلب العميل", "unknown")).toEqual({ ok: true, mode: "DELETED" });
    expect(await db.user.count({ where: { id: c.userId } })).toBe(0);
  });

  it("anonymises an account that has stars: no login, sessions gone, contacts freed, shop suspended", async () => {
    const admin = await makeAdmin();
    const m = await createMerchantByAdmin(admin, merchantInput, "unknown");
    if (!m.ok) throw new Error("setup");
    await db.$transaction((tx) => applyStarMove(tx, { userId: m.userId, amount: 10, reason: "ADMIN_CORRECTION", idempotencyKey: "seed-1" }));
    expect(await deleteUserByAdmin(admin, m.userId, "مخالفة", "unknown")).toEqual({ ok: true, mode: "ANONYMIZED" });
    const gone = await db.user.findUniqueOrThrow({ where: { id: m.userId }, include: { merchant: true } });
    expect(gone).toMatchObject({ name: "حساب محذوف", email: null, status: "SUSPENDED" });
    expect(gone.merchant?.status).toBe("SUSPENDED");
    expect((await authenticate({ email: "shop@example.com", password: merchantInput.password }, "unknown")).ok).toBe(false);
    expect((await createMerchantByAdmin(admin, merchantInput, "unknown")).ok).toBe(true); // same phone and email can be used again
    expect(await db.auditLog.count({ where: { action: "USER_DELETED", entityId: m.userId } })).toBe(1);
  });

  it("never deletes yourself or the main administrator, and needs users.manage", async () => {
    const admin = await makeAdmin();
    await expect(deleteUserByAdmin(admin, admin.user.id, "x y z", "unknown")).rejects.toBeInstanceOf(AuthorizationError);
    const customer = { user: { id: "c", role: "CUSTOMER", isSuperAdmin: false, permissions: [] } } as unknown as SessionUser;
    await expect(deleteUserByAdmin(customer, admin.user.id, "x y z", "unknown")).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("admin adjusts stars", () => {
  it("adds and takes stars through the ledger, never below zero, always with a note", async () => {
    const admin = await makeAdmin();
    const c = await createCustomerByAdmin(admin, customerInput, "unknown");
    if (!c.ok) throw new Error("setup");
    expect(await adjustStarsByAdmin(admin, c.userId, 25, "هدية ترحيب", "unknown")).toEqual({ ok: true, balanceAfter: 25 });
    expect(await adjustStarsByAdmin(admin, c.userId, -5, "تصحيح", "unknown")).toEqual({ ok: true, balanceAfter: 20 });
    expect(await adjustStarsByAdmin(admin, c.userId, -50, "أكثر من الرصيد", "unknown")).toEqual({ ok: false, error: "BELOW_ZERO" });
    expect(await adjustStarsByAdmin(admin, c.userId, 0, "صفر", "unknown")).toEqual({ ok: false, error: "INVALID_AMOUNT" });
    expect(await adjustStarsByAdmin(admin, c.userId, 5, "", "unknown")).toEqual({ ok: false, error: "INVALID_NOTE" });
    expect(await getStarBalance(db, c.userId)).toBe(20);
    expect(await db.auditLog.count({ where: { action: "STARS_ADJUSTED_BY_ADMIN" } })).toBe(2);
    await expect(adjustStarsByAdmin(admin, admin.user.id, 5, "للأدمن", "unknown")).rejects.toBeInstanceOf(AuthorizationError);
  });
});
