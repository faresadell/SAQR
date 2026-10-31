/**
 * Addresses, password reset, audit read, complaints, reports and product images (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { hashPassword } from "@/lib/auth/password";
import { createAddress, deleteAddress, listMyAddresses, MAX_ADDRESSES, updateAddress } from "@/server/addresses/service";
import { listAuditLog } from "@/server/audit/read";
import { authenticate } from "@/server/auth/auth-service";
import { confirmPasswordReset, requestPasswordReset } from "@/server/auth/password-reset";
import { readProductImage, uploadProductImage } from "@/server/catalog/product-images";
import { fileComplaint, handleComplaint, listComplaintsForAdmin, listMyComplaints } from "@/server/complaints/service";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { merchantSalesReport, platformSalesReport } from "@/server/reports/service";
import { setStorageForTests, type PrivateStorage } from "@/server/uploads/storage";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const admin: Actor = { id: "admin-1", role: "ADMIN", isSuperAdmin: true, permissions: [] };
const limited: Actor = { id: "admin-2", role: "ADMIN", isSuperAdmin: false, permissions: ["users.view"] };
let n = 0;

async function user(role: "CUSTOMER" | "MERCHANT", opts: { password?: string; verified?: boolean } = {}) {
  n += 1;
  const phone = `+2017${String(n).padStart(8, "0")}`;
  const u = await db.user.create({ data: { phone, name: `U${n}`, passwordHash: await hashPassword(opts.password ?? "Old-pass-12345"), role, status: "ACTIVE", phoneVerifiedAt: opts.verified === false ? null : new Date() } });
  return { u, phone, actor: { id: u.id, role, isSuperAdmin: false, permissions: [] } as Actor };
}

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "Complaint","Refund","OrderEvent","Order","Address","DeliveryZone","Product","Category","OtpCode","RateLimitHit","Session","Notification","AuditLog","Merchant","BusinessType","User" RESTART IDENTITY CASCADE');
  await db.businessType.create({ data: { code: "restaurant", nameAr: "مطعم" } });
});
afterEach(() => {
  setStorageForTests(undefined);
  vi.restoreAllMocks();
});

describe("addresses", () => {
  it("creates, lists, edits and deletes only the customer's own addresses in an open zone", async () => {
    const c = await user("CUSTOMER");
    const other = await user("CUSTOMER");
    const zone = await db.deliveryZone.create({ data: { name: "المعادي" } });
    const closed = await db.deliveryZone.create({ data: { name: "مغلقة", isActive: false } });
    const r = await createAddress(c.actor, { line: "شارع 9 المعادي", zoneId: zone.id, label: "البيت" });
    if (!r.ok) throw new Error("setup");
    expect(await createAddress(c.actor, { line: "abc", zoneId: zone.id })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await createAddress(c.actor, { line: "شارع طويل جدا", zoneId: closed.id })).toEqual({ ok: false, error: "ZONE_UNAVAILABLE" });
    expect(await createAddress(c.actor, { line: "شارع طويل جدا", zoneId: "missing" })).toEqual({ ok: false, error: "ZONE_UNAVAILABLE" });
    expect(await createAddress(c.actor, { line: "شارع طويل جدا", zoneId: zone.id, lat: 200 })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect((await updateAddress(c.actor, r.addressId, { line: "شارع 10 المعادي", label: null })).ok).toBe(true);
    expect(await updateAddress(c.actor, r.addressId, {})).toEqual({ ok: false, error: "INVALID_REQUEST" });
    await expect(updateAddress(other.actor, r.addressId, { line: "اختراق العنوان" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteAddress(other.actor, r.addressId)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listMyAddresses(other.actor)).length).toBe(0);
    const mine = await listMyAddresses(c.actor);
    expect(mine[0]).toMatchObject({ line: "شارع 10 المعادي", label: null });
    await deleteAddress(c.actor, r.addressId);
    expect((await listMyAddresses(c.actor)).length).toBe(0);
    const merchant = await user("MERCHANT");
    await expect(listMyAddresses(merchant.actor)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("caps the number of saved addresses", async () => {
    const c = await user("CUSTOMER");
    const zone = await db.deliveryZone.create({ data: { name: "z" } });
    await db.address.createMany({ data: Array.from({ length: MAX_ADDRESSES }, (_, i) => ({ userId: c.u.id, line: `عنوان رقم ${i}`, zoneId: zone.id })) });
    expect(await createAddress(c.actor, { line: "عنوان زائد", zoneId: zone.id })).toEqual({ ok: false, error: "TOO_MANY_ADDRESSES" });
  });
});

describe("password reset", () => {
  /** The development sender prints the code; read it back from the log line. */
  function captureCodes(): { last: () => string | undefined; count: () => number } {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const codes = () => spy.mock.calls.map((c) => /code for \S+: (\d{6})/.exec(String(c[0]))?.[1]).filter((x): x is string => !!x);
    return { last: () => codes().at(-1), count: () => codes().length };
  }

  it("answers the same for unknown, unverified and admin numbers and sends no code to them", async () => {
    const codes = captureCodes();
    expect(await requestPasswordReset("01099999999", "unknown")).toEqual({ ok: true });
    const unverified = await user("CUSTOMER", { verified: false });
    expect(await requestPasswordReset(unverified.phone, "unknown")).toEqual({ ok: true });
    const adminUser = await db.user.create({ data: { phone: "+201088888888", name: "A", passwordHash: "x", role: "ADMIN", status: "ACTIVE", phoneVerifiedAt: new Date() } });
    expect(await requestPasswordReset(adminUser.phone, "unknown")).toEqual({ ok: true });
    expect(codes.count()).toBe(0);
    expect(await requestPasswordReset("not-a-phone", "unknown")).toEqual({ ok: false, error: "INVALID_REQUEST" });
  });

  it("resets with a valid code once: new password works, old one and all sessions are gone, the code cannot be reused", async () => {
    const codes = captureCodes();
    const c = await user("CUSTOMER", { password: "Old-pass-12345" });
    await db.session.create({ data: { userId: c.u.id, tokenHash: "h".repeat(64), expiresAt: new Date(Date.now() + 3_600_000) } });
    await db.user.update({ where: { id: c.u.id }, data: { failedLoginCount: 4, lockedUntil: new Date(Date.now() + 600_000) } });
    expect(await requestPasswordReset(c.phone, "unknown")).toEqual({ ok: true });
    const code = codes.last();
    expect(code).toMatch(/^\d{6}$/);
    expect(await confirmPasswordReset(c.phone, "000000", "New-pass-98765", "unknown")).toMatchObject({ ok: false, error: "INVALID_CODE" });
    expect(await confirmPasswordReset(c.phone, code!, "12345678", "unknown")).toMatchObject({ ok: false, error: "WEAK_PASSWORD" }); // the code is not wasted
    expect(await confirmPasswordReset(c.phone, code!, "New-pass-98765", "unknown")).toEqual({ ok: true });
    expect(await confirmPasswordReset(c.phone, code!, "Other-pass-5555", "unknown")).toMatchObject({ ok: false, error: "INVALID_CODE" });
    expect(await db.session.count({ where: { userId: c.u.id } })).toBe(0);
    expect((await authenticate({ phone: c.phone, password: "New-pass-98765" }, "unknown")).ok).toBe(true);
    expect((await authenticate({ phone: c.phone, password: "Old-pass-12345" }, "unknown")).ok).toBe(false);
    expect(await db.auditLog.count({ where: { action: "PASSWORD_RESET", entityId: c.u.id } })).toBe(1);
  });

  it("a code for one purpose or one number does not work for another", async () => {
    const codes = captureCodes();
    const a = await user("CUSTOMER");
    const b = await user("CUSTOMER");
    await requestPasswordReset(a.phone, "unknown");
    const code = codes.last()!;
    expect(await confirmPasswordReset(b.phone, code, "New-pass-98765", "unknown")).toMatchObject({ ok: false, error: "INVALID_CODE" });
  });
});

describe("audit log read", () => {
  it("needs audit.view, filters, and pages with a cursor (newest first)", async () => {
    for (let i = 0; i < 5; i += 1) await db.auditLog.create({ data: { action: i % 2 ? "A_ODD" : "A_EVEN", entityType: "T", entityId: `e${i}`, actorId: "x" } });
    await expect(listAuditLog(limited)).rejects.toBeInstanceOf(AuthorizationError);
    const p1 = await listAuditLog(admin, { limit: 2 });
    expect(p1.items.length).toBe(2);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await listAuditLog(admin, { limit: 2, cursor: p1.nextCursor! });
    expect(p2.items.map((r) => r.id)).not.toContain(p1.items[0]!.id);
    const all = [...p1.items, ...p2.items, ...(await listAuditLog(admin, { limit: 2, cursor: p2.nextCursor! })).items];
    expect(new Set(all.map((r) => r.id)).size).toBe(5);
    expect((await listAuditLog(admin, { action: "A_ODD" })).items.length).toBe(2);
    expect((await listAuditLog(admin, { entityId: "e3" })).items.length).toBe(1);
    expect((await listAuditLog(admin, { limit: 9999 })).items.length).toBe(5); // limit is capped, not trusted
  });
});

async function shopWithOrder(ownerPhoneSeed?: string) {
  void ownerPhoneSeed;
  const owner = await user("MERCHANT");
  const customer = await user("CUSTOMER");
  const shop = await db.merchant.create({ data: { ownerId: owner.u.id, name: `shop${n}`, businessType: "restaurant", status: "APPROVED" } });
  const order = await db.order.create({ data: { customerId: customer.u.id, merchantId: shop.id, subtotalCents: 10_000, deliveryFeeCents: 2_000, totalCents: 12_000, merchantTierSnap: "REGULAR", commissionBp: 800, commissionBaseCents: 10_000, commissionCents: 800, deliveryRuleSnap: {}, addressSnap: {} } });
  return { owner, customer, shop, order };
}

describe("complaints", () => {
  it("a customer files about their own order only; the shop is told; admins handle it step by step", async () => {
    const { owner, customer, order } = await shopWithOrder();
    const stranger = await user("CUSTOMER");
    expect(await fileComplaint(customer.actor, { orderId: order.id, subject: "قصير", details: "تفاصيل قصيرة" }).then((r) => r.ok)).toBe(true);
    await expect(fileComplaint(stranger.actor, { orderId: order.id, subject: "شكوى ما", details: "تفاصيل كافية للشكوى" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(fileComplaint(owner.actor, { orderId: order.id, subject: "شكوى ما", details: "تفاصيل كافية للشكوى" })).rejects.toBeInstanceOf(AuthorizationError);
    expect(await fileComplaint(customer.actor, { orderId: order.id, subject: "x", details: "تفاصيل كافية للشكوى" })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await db.notification.count({ where: { userId: owner.u.id, type: "COMPLAINT_FILED" } })).toBe(1);

    const c = (await listMyComplaints(customer.actor))[0]!;
    expect((await listMyComplaints(stranger.actor)).length).toBe(0);
    await expect(listComplaintsForAdmin(limited)).rejects.toBeInstanceOf(AuthorizationError);
    expect((await listComplaintsForAdmin(admin, "OPEN")).length).toBe(1);
    await expect(handleComplaint(limited, c.id, "IN_REVIEW")).rejects.toBeInstanceOf(AuthorizationError);
    expect(await handleComplaint(admin, c.id, "RESOLVED")).toEqual({ ok: false, error: "INVALID_REQUEST" }); // a response is required
    expect((await handleComplaint(admin, c.id, "IN_REVIEW")).ok).toBe(true);
    const both = await Promise.all([handleComplaint(admin, c.id, "RESOLVED", "تم التواصل مع التاجر وحل المشكلة"), handleComplaint(admin, c.id, "RESOLVED", "تم التواصل مع التاجر وحل المشكلة")]);
    expect(both.filter((r) => r.ok).length).toBe(1);
    expect(await handleComplaint(admin, c.id, "DISMISSED", "رد آخر مختلف")).toEqual({ ok: false, error: "WRONG_STATE" });
    expect((await listMyComplaints(customer.actor))[0]).toMatchObject({ status: "RESOLVED", adminResponse: "تم التواصل مع التاجر وحل المشكلة" });
    await expect(db.$executeRawUnsafe(`UPDATE "Complaint" SET "status" = 'OPEN' WHERE id = '${c.id}'`)).rejects.toThrow();
    await expect(db.$executeRawUnsafe(`DELETE FROM "Complaint" WHERE id = '${c.id}'`)).rejects.toThrow();
  });

  it("limits how many complaints one customer can file in a day", async () => {
    const { customer, order } = await shopWithOrder();
    let blocked = 0;
    for (let i = 0; i < 12; i += 1) {
      const r = await fileComplaint(customer.actor, { orderId: order.id, subject: `شكوى رقم ${i}`, details: "تفاصيل كافية للشكوى" });
      if (!r.ok && r.error === "RATE_LIMITED") blocked += 1;
    }
    expect(blocked).toBe(2);
  });
});

describe("sales reports", () => {
  it("counts delivered orders of the Cairo month at their stored rate, minus refunds; shops only see their own", async () => {
    const a = await shopWithOrder();
    const b = await shopWithOrder();
    const inSept = new Date("2026-09-15T10:00:00Z");
    await db.orderEvent.create({ data: { orderId: a.order.id, field: "orderStatus", toValue: "DELIVERED", createdAt: inSept } });
    await db.orderEvent.create({ data: { orderId: b.order.id, field: "orderStatus", toValue: "DELIVERED", createdAt: inSept } });
    const second = await db.order.create({ data: { customerId: a.customer.u.id, merchantId: a.shop.id, subtotalCents: 5_000, deliveryFeeCents: 2_000, totalCents: 7_000, merchantTierSnap: "BUSINESS", commissionBp: 500, commissionBaseCents: 5_000, commissionCents: 250, deliveryRuleSnap: {}, addressSnap: {} } });
    await db.orderEvent.create({ data: { orderId: second.id, field: "orderStatus", toValue: "DELIVERED", createdAt: inSept } });
    await db.orderEvent.create({ data: { orderId: second.id, field: "orderStatus", toValue: "CANCELLED", createdAt: new Date("2026-09-20T10:00:00Z") } });
    await db.refund.create({ data: { orderId: a.order.id, amountCents: 2_500, status: "COMPLETED", dueAt: inSept } });
    const r = await merchantSalesReport(a.owner.actor, "2026-09");
    expect(r).toMatchObject({ deliveredOrders: 2, productSalesCents: 15_000, refundedCents: 2_500, commissionCents: 600 + 250, cancelledOrders: 1 });
    expect(r!.netAfterCommissionCents).toBe(7_500 + 5_000 - 850);
    expect((await merchantSalesReport(b.owner.actor, "2026-09"))!.deliveredOrders).toBe(1);
    expect((await platformSalesReport(admin, "2026-09"))!.deliveredOrders).toBe(3);
    expect((await merchantSalesReport(a.owner.actor, "2026-10"))!.deliveredOrders).toBe(0);
    expect(await merchantSalesReport(a.owner.actor, "2026-13")).toBeNull();
    await expect(platformSalesReport(limited, "2026-09")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(merchantSalesReport(a.customer.actor, "2026-09")).rejects.toBeInstanceOf(AuthorizationError);
  });
});

function memoryStorage(): PrivateStorage & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return { files, put: async (k, b) => void files.set(k, b), get: async (k) => files.get(k) ?? null };
}
const jpeg = (size = 64) => Uint8Array.from([0xff, 0xd8, 0xff, ...Array.from({ length: size }, (_, i) => i % 250)]);

describe("product images", () => {
  async function product(ownerId: string, merchantId: string) {
    const category = await db.category.create({ data: { nameAr: `c${n}` } });
    return db.product.create({ data: { merchantId, categoryId: category.id, nameAr: "منتج", priceCents: 1000 } });
  }

  it("the shop owner sets a picture (type decided from the bytes); others cannot; shoppers see it only while visible", async () => {
    const storage = memoryStorage();
    setStorageForTests(storage);
    const a = await shopWithOrder();
    const b = await shopWithOrder();
    const p = await product(a.owner.u.id, a.shop.id);
    expect(await uploadProductImage(a.owner.actor, p.id, jpeg())).toEqual({ ok: true });
    expect(await uploadProductImage(a.owner.actor, p.id, new Uint8Array(40))).toEqual({ ok: false, error: "INVALID_FILE" });
    expect(await uploadProductImage(a.owner.actor, p.id, jpeg(6 * 1024 * 1024))).toEqual({ ok: false, error: "FILE_TOO_LARGE" });
    await expect(uploadProductImage(b.owner.actor, p.id, jpeg())).rejects.toBeInstanceOf(NotFoundError);
    await expect(uploadProductImage(a.customer.actor, p.id, jpeg())).rejects.toBeInstanceOf(AuthorizationError);
    const first = (await db.product.findUniqueOrThrow({ where: { id: p.id } })).imageKey!;
    expect(first).toMatch(/^product-images\/.+\.jpg$/);
    expect(await uploadProductImage(a.owner.actor, p.id, jpeg(80))).toEqual({ ok: true });
    const second = (await db.product.findUniqueOrThrow({ where: { id: p.id } })).imageKey!;
    expect(second).not.toBe(first); // a new key each time
    expect(await readProductImage(p.id)).toMatchObject({ contentType: "image/jpeg" });
    await db.product.update({ where: { id: p.id }, data: { isAvailable: false } });
    expect(await readProductImage(p.id)).toBeNull();
    await db.product.update({ where: { id: p.id }, data: { isAvailable: true } });
    await db.merchant.update({ where: { id: a.shop.id }, data: { status: "SUSPENDED" } });
    expect(await readProductImage(p.id)).toBeNull();
    expect(await db.auditLog.count({ where: { action: "PRODUCT_IMAGE_SET", entityId: p.id } })).toBe(2);
  });
});
