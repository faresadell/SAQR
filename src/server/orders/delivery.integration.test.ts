/**
 * Cancellation-request, drivers and delivery integration tests (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { invalidateSettingsCache } from "@/lib/settings";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { createDriver, listMyDrivers, setDriverActive } from "@/server/drivers/service";
import { placeOrder } from "@/server/orders/checkout";
import { assignDriver, deliver, listMyDeliveries, pickUp, reportFailure } from "@/server/orders/delivery";
import { advanceOrder, cancelOrder, confirmPayment, decideOrder, requestCancellation, resolveCancellation, submitPayment } from "@/server/orders/lifecycle";
import { applyStarMove, getStarBalance } from "@/server/stars/ledger";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const past = new Date(Date.now() - 86_400_000);
let n = 0;
let uploads = 0;

async function user(role: "CUSTOMER" | "MERCHANT" | "DRIVER"): Promise<Actor> {
  n += 1;
  const u = await db.user.create({ data: { phone: `+2015${String(n).padStart(8, "0")}`, name: `U${n}`, passwordHash: "x", role, status: "ACTIVE" } });
  return { id: u.id, role, isSuperAdmin: false, permissions: [] };
}
const give = (userId: string, amount: number) => db.$transaction((tx) => applyStarMove(tx, { userId, amount, reason: "PURCHASE", idempotencyKey: `seed:${userId}` }));

interface World {
  customer: Actor;
  stranger: Actor;
  owner: Actor;
  otherOwner: Actor;
  shopId: string;
  otherShopId: string;
  productId: string;
  addressId: string;
}
let w: World;

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "DeliveryRecord","Driver","Refund","Payment","ParentOrder","Order","StarLedgerEntry","StarAccount","PlatformSettingVersion","CommissionRate","PaymentMethodConfig","DeliveryFeeVersion","DeliveryZone","BusinessType","Category","AuditLog","Notification","ReceiptUpload","User" RESTART IDENTITY CASCADE',
  );
  invalidateSettingsCache();
  await db.businessType.create({ data: { code: "restaurant", nameAr: "مطعم" } });
  const category = await db.category.create({ data: { nameAr: "عام" } });
  await db.commissionRate.createMany({ data: [{ tier: "REGULAR", basisPoints: 800, effectiveFrom: past, createdById: "t" }, { tier: "BUSINESS", basisPoints: 500, effectiveFrom: past, createdById: "t" }] });
  await db.paymentMethodConfig.create({ data: { code: "instapay", nameAr: "انستا باي", isEnabled: true, receiverNumber: "01000000000" } });
  await db.platformSettingVersion.create({ data: { key: "orders.merchant_response_minutes", value: { v: 30 }, effectiveFrom: past, createdById: "test" } });
  invalidateSettingsCache();
  const zone = await db.deliveryZone.create({ data: { name: "المعادي" } });
  await db.deliveryFeeVersion.create({ data: { zoneId: zone.id, feeCents: 2000, effectiveFrom: past, createdById: "t" } });
  const customer = await user("CUSTOMER");
  const stranger = await user("CUSTOMER");
  const owner = await user("MERCHANT");
  const otherOwner = await user("MERCHANT");
  const address = await db.address.create({ data: { userId: customer.id, line: "شارع 9", zoneId: zone.id } });
  for (const u of [customer, owner, otherOwner]) await give(u.id, 20);
  const shop = await db.merchant.create({ data: { ownerId: owner.id, name: "A", businessType: "restaurant", status: "APPROVED" } });
  const other = await db.merchant.create({ data: { ownerId: otherOwner.id, name: "B", businessType: "restaurant", status: "APPROVED" } });
  const product = await db.product.create({ data: { merchantId: shop.id, categoryId: category.id, nameAr: "منتج", priceCents: 5000 } });
  w = { customer, stranger, owner, otherOwner, shopId: shop.id, otherShopId: other.id, productId: product.id, addressId: address.id };
});

let keyNo = 0;
/** A paid order, still waiting for the shop's decision. */
async function paidOrder(): Promise<string> {
  keyNo += 1;
  const r = await placeOrder(w.customer, { idempotencyKey: `key-${String(keyNo).padStart(8, "0")}`, addressId: w.addressId, lines: [{ productId: w.productId, quantity: 2 }] });
  if (!r.ok) throw new Error("setup");
  const id = r.suborderIds[0]!;
  uploads += 1;
  const up = await db.receiptUpload.create({ data: { orderId: id, uploaderId: w.customer.id, storageKey: `receipts/${id}/${uploads}.jpg`, contentType: "image/jpeg", sizeBytes: 10, sha256: `d${uploads}` } });
  expect((await submitPayment(w.customer, id, { method: "instapay", referenceNo: `DREF-${keyNo}000`, uploadId: up.id })).ok).toBe(true);
  expect((await confirmPayment(w.owner, id)).ok).toBe(true);
  return id;
}
const approvedOrder = async () => {
  const id = await paidOrder();
  expect((await decideOrder(w.owner, id, "APPROVE")).ok).toBe(true);
  return id;
};
const status = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).orderStatus;

describe("cancellation request", () => {
  it("customer asks, shop accepts: stars go back to both once, refund opens, repeats do nothing", async () => {
    const id = await approvedOrder();
    expect(await getStarBalance(db, w.customer.id)).toBe(18);
    expect(await cancelOrder(w.customer, id, "غيرت رأيي")).toEqual({ ok: false, error: "WRONG_STATE" }); // direct cancel is closed after acceptance
    expect((await requestCancellation(w.customer, id, "غيرت رأيي")).ok).toBe(true);
    expect(await status(id)).toBe("CANCELLATION_REQUESTED");
    expect(await requestCancellation(w.customer, id, "مرة تانية")).toEqual({ ok: false, error: "WRONG_STATE" });
    await expect(requestCancellation(w.stranger, id, "x yz")).rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveCancellation(w.otherOwner, id, "ACCEPT")).rejects.toBeInstanceOf(NotFoundError);

    const both = await Promise.all([resolveCancellation(w.owner, id, "ACCEPT"), resolveCancellation(w.owner, id, "ACCEPT")]);
    expect(both.filter((r) => r.ok).length).toBe(1);
    expect(await status(id)).toBe("CANCELLED");
    expect(await getStarBalance(db, w.customer.id)).toBe(20);
    expect(await getStarBalance(db, w.owner.id)).toBe(20);
    expect(await db.starLedgerEntry.count({ where: { orderId: id, reason: "ORDER_REFUND" } })).toBe(2);
    expect(await db.refund.count({ where: { orderId: id } })).toBe(1);
    expect(await resolveCancellation(w.owner, id, "ACCEPT")).toEqual({ ok: false, error: "WRONG_STATE" });
    expect(await cancelOrder(w.owner, id, "تاني")).toEqual({ ok: false, error: "WRONG_STATE" });
    expect(await getStarBalance(db, w.customer.id)).toBe(20);
    expect(await db.notification.count({ where: { userId: w.owner.id, type: "ORDER_CANCEL_REQUESTED" } })).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: id, action: "ORDER_CANCEL_ACCEPTED" } })).toBe(1);
  });

  it("decline needs a reason, returns the order to its earlier stage, and keeps the stars charged", async () => {
    const id = await approvedOrder();
    await advanceOrder(w.owner, id, "PREPARING");
    expect((await requestCancellation(w.customer, id, "تأخرت")).ok).toBe(true);
    expect(await resolveCancellation(w.owner, id, "DECLINE")).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect((await resolveCancellation(w.owner, id, "DECLINE", "بدأ التجهيز فعلاً")).ok).toBe(true);
    expect(await status(id)).toBe("PREPARING");
    expect(await getStarBalance(db, w.customer.id)).toBe(18);
    expect(await db.notification.count({ where: { userId: w.customer.id, type: "ORDER_CANCEL_DECLINED" } })).toBe(1);
    expect((await requestCancellation(w.customer, id, "تاني مرة")).ok).toBe(true); // a new request is a new request
    expect(await db.notification.count({ where: { userId: w.owner.id, type: "ORDER_CANCEL_REQUESTED" } })).toBe(2);
  });

  it("cannot be requested before acceptance or once the order is out for delivery", async () => {
    const early = await paidOrder();
    expect(await requestCancellation(w.customer, early, "مبكر")).toEqual({ ok: false, error: "WRONG_STATE" });
    const id = await approvedOrder();
    await advanceOrder(w.owner, id, "PREPARING");
    await advanceOrder(w.owner, id, "READY");
    await advanceOrder(w.owner, id, "OUT_FOR_DELIVERY");
    expect(await requestCancellation(w.customer, id, "متأخر")).toEqual({ ok: false, error: "WRONG_STATE" });
    expect(await requestCancellation(w.customer, "x".repeat(10), "")).toEqual({ ok: false, error: "INVALID_REQUEST" });
  });

  it("the shop may also cancel a requested order directly, stars refunded once", async () => {
    const id = await approvedOrder();
    await requestCancellation(w.customer, id, "عايز ألغي");
    expect((await cancelOrder(w.owner, id, "تم الاتفاق")).ok).toBe(true);
    expect(await getStarBalance(db, w.customer.id)).toBe(20);
    expect(await db.starLedgerEntry.count({ where: { orderId: id, reason: "ORDER_REFUND" } })).toBe(2);
  });
});

describe("drivers", () => {
  it("a shop creates drivers tied to itself; weak password, duplicate phone and non-shops are refused", async () => {
    const ok = await createDriver(w.owner, { name: "سواق ١", phone: "01011112222", password: "Sturdy-pass-91" });
    expect(ok.ok).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { phone: "+201011112222" } });
    expect(user).toMatchObject({ role: "DRIVER", status: "PENDING" }); // verifies the phone by code at first sign-in
    expect(await db.driver.count({ where: { merchantId: w.shopId } })).toBe(1);
    expect(await createDriver(w.owner, { name: "سواق ٢", phone: "01011112222", password: "Sturdy-pass-91" })).toEqual({ ok: false, error: "PHONE_IN_USE" });
    expect(await createDriver(w.owner, { name: "سواق ٣", phone: "01022223333", password: "12345678" })).toEqual({ ok: false, error: "WEAK_PASSWORD" });
    expect(await createDriver(w.owner, { name: "x", phone: "123", password: "Sturdy-pass-91" })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    await expect(createDriver(w.customer, { name: "سواق", phone: "01033334444", password: "Sturdy-pass-91" })).rejects.toBeInstanceOf(AuthorizationError);
    expect((await listMyDrivers(w.owner)).length).toBe(1);
    expect((await listMyDrivers(w.otherOwner)).length).toBe(0);
    const id = (await db.driver.findFirstOrThrow()).id;
    await expect(setDriverActive(w.otherOwner, id, false)).rejects.toBeInstanceOf(NotFoundError);
    await setDriverActive(w.owner, id, false);
    expect(await db.auditLog.count({ where: { action: "DRIVER_ACTIVE_CHANGED" } })).toBe(1);
  });
});

async function driverOf(owner: Actor, shopId: string): Promise<{ actor: Actor; driverId: string }> {
  const actor = await user("DRIVER");
  const d = await db.driver.create({ data: { userId: actor.id, merchantId: shopId } });
  void owner;
  return { actor, driverId: d.id };
}

describe("delivery", () => {
  it("assign -> pickup -> deliver: states follow, the cash fee is recorded, nothing repeats", async () => {
    const id = await approvedOrder();
    const d = await driverOf(w.owner, w.shopId);
    expect((await assignDriver(w.owner, id, d.driverId)).ok).toBe(true);
    expect((await db.order.findUniqueOrThrow({ where: { id } })).deliveryStatus).toBe("DRIVER_ASSIGNED");
    expect(await pickUp(d.actor, id)).toEqual({ ok: false, error: "WRONG_STATE" }); // the shop has not finished preparing
    await advanceOrder(w.owner, id, "PREPARING");
    await advanceOrder(w.owner, id, "READY");
    expect((await pickUp(d.actor, id)).ok).toBe(true);
    expect(await status(id)).toBe("OUT_FOR_DELIVERY");
    expect(await pickUp(d.actor, id)).toEqual({ ok: false, error: "WRONG_STATE" });
    expect(await advanceOrder(w.owner, id, "DELIVERED")).toEqual({ ok: false, error: "WRONG_STATE" }); // only the driver confirms delivery now
    expect(await deliver(d.actor, id, { feeCollected: false })).toEqual({ ok: false, error: "INVALID_REQUEST" });

    const both = await Promise.all([deliver(d.actor, id, { feeCollected: true }), deliver(d.actor, id, { feeCollected: true })]);
    expect(both.filter((r) => r.ok).length).toBe(1);
    expect(await status(id)).toBe("DELIVERED");
    const rec = await db.deliveryRecord.findUniqueOrThrow({ where: { orderId: id } });
    expect(rec).toMatchObject({ collectionStatus: "COLLECTED", feeExpectedCents: 2000 });
    expect(rec.deliveredAt).not.toBeNull();
    expect(await db.orderEvent.count({ where: { orderId: id, field: "orderStatus", toValue: "DELIVERED" } })).toBe(1); // what settlements read
    expect(await db.notification.count({ where: { userId: w.customer.id, type: "ORDER_DELIVERED" } })).toBe(1);
    expect((await listMyDeliveries(d.actor, "HISTORY")).length).toBe(1);
    expect((await listMyDeliveries(d.actor, "ACTIVE")).length).toBe(0);
  });

  it("an uncollected fee is recorded as an exception with a note", async () => {
    const id = await approvedOrder();
    const d = await driverOf(w.owner, w.shopId);
    await assignDriver(w.owner, id, d.driverId);
    await advanceOrder(w.owner, id, "PREPARING");
    await advanceOrder(w.owner, id, "READY");
    await pickUp(d.actor, id);
    expect((await deliver(d.actor, id, { feeCollected: false, note: "العميل رفض الدفع" })).ok).toBe(true);
    expect(await db.deliveryRecord.findUniqueOrThrow({ where: { orderId: id } })).toMatchObject({ collectionStatus: "EXCEPTION", exceptionNote: "العميل رفض الدفع" });
  });

  it("only the shop's own active, verified drivers can be assigned; others cannot see or act on the order", async () => {
    const id = await approvedOrder();
    const foreign = await driverOf(w.otherOwner, w.otherShopId);
    const mine = await driverOf(w.owner, w.shopId);
    expect(await assignDriver(w.owner, id, foreign.driverId)).toEqual({ ok: false, error: "DRIVER_NOT_AVAILABLE" });
    await setDriverActive(w.owner, mine.driverId, false);
    expect(await assignDriver(w.owner, id, mine.driverId)).toEqual({ ok: false, error: "DRIVER_NOT_AVAILABLE" });
    await setDriverActive(w.owner, mine.driverId, true);
    await db.user.update({ where: { id: mine.actor.id }, data: { status: "PENDING" } });
    expect(await assignDriver(w.owner, id, mine.driverId)).toEqual({ ok: false, error: "DRIVER_NOT_AVAILABLE" });
    await db.user.update({ where: { id: mine.actor.id }, data: { status: "ACTIVE" } });
    await expect(assignDriver(w.otherOwner, id, foreign.driverId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(assignDriver(w.customer, id, mine.driverId)).rejects.toBeInstanceOf(NotFoundError);
    expect((await assignDriver(w.owner, id, mine.driverId)).ok).toBe(true);
    await expect(pickUp(foreign.actor, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(pickUp(w.owner, id)).rejects.toBeInstanceOf(AuthorizationError);
    expect((await listMyDeliveries(foreign.actor, "ACTIVE")).length).toBe(0);
    expect((await listMyDeliveries(mine.actor, "ACTIVE")).map((x) => x.orderId)).toEqual([id]);
  });

  it("refuses assignment before payment is confirmed, and a failed delivery can be reassigned", async () => {
    keyNo += 1;
    const placed = await placeOrder(w.customer, { idempotencyKey: `key-${String(keyNo).padStart(8, "0")}`, addressId: w.addressId, lines: [{ productId: w.productId, quantity: 1 }] });
    if (!placed.ok) throw new Error("setup");
    const d1 = await driverOf(w.owner, w.shopId);
    const d2 = await driverOf(w.owner, w.shopId);
    expect(await assignDriver(w.owner, placed.suborderIds[0]!, d1.driverId)).toEqual({ ok: false, error: "WRONG_STATE" });

    const id = await approvedOrder();
    await assignDriver(w.owner, id, d1.driverId);
    await advanceOrder(w.owner, id, "PREPARING");
    await advanceOrder(w.owner, id, "READY");
    await pickUp(d1.actor, id);
    expect(await reportFailure(d1.actor, id, "")).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect((await reportFailure(d1.actor, id, "العميل مش بيرد")).ok).toBe(true);
    expect(await db.notification.count({ where: { userId: w.owner.id, type: "DELIVERY_FAILED" } })).toBe(1);
    expect(await deliver(d1.actor, id, { feeCollected: true })).toEqual({ ok: false, error: "WRONG_STATE" });
    expect((await assignDriver(w.owner, id, d2.driverId)).ok).toBe(true);
    await expect(pickUp(d1.actor, id)).rejects.toBeInstanceOf(NotFoundError); // no longer theirs
    expect((await pickUp(d2.actor, id)).ok).toBe(true);
    expect(await status(id)).toBe("OUT_FOR_DELIVERY"); // moved once, not again
    expect((await deliver(d2.actor, id, { feeCollected: true })).ok).toBe(true);
    expect(await db.orderEvent.count({ where: { orderId: id, field: "orderStatus", toValue: "OUT_FOR_DELIVERY" } })).toBe(1);
  });
});
