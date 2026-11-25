/**
 * Cancellation-request, drivers and delivery integration tests (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { accountForOrder, giveAccount, grantPackage } from "@/test-support/package";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { invalidateSettingsCache } from "@/lib/settings";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { getMyAvailability, listDriversForShop, setMyAvailability } from "@/server/drivers/service";
import { flushNotificationEmails, setNoticeSenderForTests, type NoticeSender } from "@/server/notifications/email";
import { createAddress } from "@/server/addresses/service";
import { announceBoardOrders } from "@/server/orders/driver-board";
import { sweepDeliveryTimeouts } from "@/server/orders/delivery-timeouts";
import { placeOrder } from "@/server/orders/checkout";
import { answerDeliveryFee, assignDriver, deliver, listMyDeliveries, pickUp, proposeDeliveryFee, reportFailure } from "@/server/orders/delivery";
import { getDriverPositionForCustomer, shareLocation, stopSharing } from "@/server/drivers/location";
import { claimOrder, listBoard, releaseOrder } from "@/server/orders/driver-board";
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
  await db.platformSettingVersion.create({ data: { key: "stars.free_trial_orders", value: { v: 0 }, effectiveFrom: past, createdById: "test" } });
  invalidateSettingsCache();
  const zone = await db.deliveryZone.create({ data: { name: "المعادي" } });
  await db.deliveryFeeVersion.create({ data: { zoneId: zone.id, feeCents: 2000, effectiveFrom: past, createdById: "t" } });
  const customer = await user("CUSTOMER");
  const stranger = await user("CUSTOMER");
  const owner = await user("MERCHANT");
  const otherOwner = await user("MERCHANT");
  const address = await db.address.create({ data: { userId: customer.id, line: "شارع 9", zoneId: zone.id } });
  for (const u of [customer, owner, otherOwner]) await give(u.id, 20);
  await grantPackage(owner.id);
  await grantPackage(otherOwner.id);
  const shop = await db.merchant.create({ data: { ownerId: owner.id, name: "A", businessType: "restaurant", status: "APPROVED" } });
  const other = await db.merchant.create({ data: { ownerId: otherOwner.id, name: "B", businessType: "restaurant", status: "APPROVED" } });
  await giveAccount(shop.id);
  await giveAccount(other.id);
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
  expect((await submitPayment(w.customer, id, { accountId: await accountForOrder(id), referenceNo: `DREF-${keyNo}000`, uploadId: up.id })).ok).toBe(true);
  expect((await confirmPayment(w.owner, id)).ok).toBe(true);
  return id;
}
const approvedOrder = async () => {
  const id = await paidOrder();
  expect((await decideOrder(w.owner, id, "APPROVE")).ok).toBe(true);
  return id;
};
const status = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).orderStatus;

/** A board-claimed order may only be picked up after the customer agreed to the driver's price. */
const agreeFee = async (driver: Actor, id: string, cents = 2000) => {
  expect(await proposeDeliveryFee(driver, id, cents)).toEqual({ ok: true });
  expect(await answerDeliveryFee(w.customer, id, true)).toEqual({ ok: true });
};
const codeOf = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).deliveryCode ?? undefined;

/** One customer order with a product from each of the two shops: two sub-orders, both paid, confirmed and approved. */
async function twoShopOrder(): Promise<[string, string]> {
  const category = await db.category.findFirstOrThrow();
  const productB = await db.product.create({ data: { merchantId: w.otherShopId, categoryId: category.id, nameAr: "منتج ب", priceCents: 3000 } });
  keyNo += 1;
  const r = await placeOrder(w.customer, { idempotencyKey: `key-${String(keyNo).padStart(8, "0")}`, addressId: w.addressId, lines: [{ productId: w.productId, quantity: 1 }, { productId: productB.id, quantity: 1 }] });
  if (!r.ok) throw new Error("setup");
  const owners = new Map([[w.shopId, w.owner], [w.otherShopId, w.otherOwner]]);
  const ids: string[] = [];
  for (const id of r.suborderIds) {
    const shopOwner = owners.get((await db.order.findUniqueOrThrow({ where: { id } })).merchantId)!;
    uploads += 1;
    const up = await db.receiptUpload.create({ data: { orderId: id, uploaderId: w.customer.id, storageKey: `receipts/${id}/${uploads}.jpg`, contentType: "image/jpeg", sizeBytes: 10, sha256: `t${uploads}` } });
    expect((await submitPayment(w.customer, id, { accountId: await accountForOrder(id), referenceNo: `TREF-${uploads}000`, uploadId: up.id })).ok).toBe(true);
    expect((await confirmPayment(shopOwner, id)).ok).toBe(true);
    expect((await decideOrder(shopOwner, id, "APPROVE")).ok).toBe(true);
    ids.push(id);
  }
  return [ids[0]!, ids[1]!];
}

describe("one trip for one customer order", () => {
  it("taking one sub-order takes the others; one price for the whole trip; each order has its own code", async () => {
    const [first, second] = await twoShopOrder();
    const d = await user("DRIVER");
    expect(await claimOrder(d, second)).toEqual({ ok: true }); // claiming either takes both
    const records = await db.deliveryRecord.findMany({ orderBy: { order: { number: "asc" } } });
    expect(records.map((r) => [r.orderId, r.feeExpectedCents, r.feeStatus])).toEqual([[first, 2000, "NONE"], [second, 0, "NONE"]]);
    expect(await listBoard(await user("DRIVER"))).toEqual([]);
    expect(await proposeDeliveryFee(d, second, 3500)).toEqual({ ok: true }); // proposing from either order prices the trip
    expect((await db.deliveryRecord.findMany({ orderBy: { order: { number: "asc" } } })).map((r) => [r.feeExpectedCents, r.feeStatus])).toEqual([[3500, "PROPOSED"], [0, "PROPOSED"]]);
    expect(await answerDeliveryFee(w.customer, first, true)).toEqual({ ok: true });
    expect((await db.deliveryRecord.findMany()).every((r) => r.feeStatus === "APPROVED")).toBe(true);
    for (const [id, shopOwner] of [[first, w.owner], [second, w.otherOwner]] as const) {
      await advanceOrder(shopOwner, id, "PREPARING");
      await advanceOrder(shopOwner, id, "READY");
      expect((await pickUp(d, id)).ok).toBe(true);
    }
    const [c1, c2] = [await codeOf(first), await codeOf(second)];
    expect(c1).toMatch(/^\d{4}$/);
    expect(c2).toMatch(/^\d{4}$/);
    expect(await deliver(d, second, { feeCollected: true, code: c1 === c2 ? undefined : c1 })).toEqual({ ok: false, error: "INVALID_CODE" }); // another order's code does not work
    expect((await deliver(d, second, { feeCollected: true, code: c2 })).ok).toBe(true);
    expect((await deliver(d, first, { feeCollected: true, code: c1 })).ok).toBe(true);
    expect((await db.deliveryRecord.findMany()).every((r) => r.collectionStatus === "COLLECTED")).toBe(true);
  });

  it("refusing the price or releasing sends the whole trip back to the board", async () => {
    const [first, second] = await twoShopOrder();
    const a = await user("DRIVER");
    const b = await user("DRIVER");
    await claimOrder(a, first);
    await proposeDeliveryFee(a, first, 3000);
    expect(await answerDeliveryFee(w.customer, second, false)).toEqual({ ok: true });
    expect((await listBoard(b)).map((r) => r.orderId).sort()).toEqual([first, second].sort());
    expect((await db.deliveryRecord.findMany()).map((r) => [r.driverId, r.feeStatus, r.feeExpectedCents])).toEqual([[null, "NONE", 2000], [null, "NONE", 2000]]);
    await claimOrder(b, second);
    expect(await releaseOrder(b, first)).toEqual({ ok: true });
    expect((await listBoard(a)).length).toBe(2);
  });
});

describe("driver live location", () => {
  it("is shared only with an active delivery, shown only to the order's customer while out for delivery, and deleted afterwards", async () => {
    const id = await approvedOrder();
    const d = await user("DRIVER");
    expect(await shareLocation(d, 30.04, 31.23)).toEqual({ ok: false, error: "NO_ACTIVE_DELIVERY" });
    await claimOrder(d, id);
    expect(await shareLocation(d, 120, 31.23)).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await shareLocation(d, 30.04, 31.23, 12)).toEqual({ ok: true });
    expect(await getDriverPositionForCustomer(w.customer, id)).toBeNull(); // not out for delivery yet
    await agreeFee(d, id);
    await advanceOrder(w.owner, id, "PREPARING");
    await advanceOrder(w.owner, id, "READY");
    await pickUp(d, id);
    expect(await getDriverPositionForCustomer(w.customer, id)).toMatchObject({ lat: 30.04, lng: 31.23 });
    await expect(getDriverPositionForCustomer(w.stranger, id)).rejects.toBeInstanceOf(NotFoundError); // someone else's order
    await expect(shareLocation(w.customer, 30, 31)).rejects.toBeInstanceOf(AuthorizationError);
    await db.driverLocation.updateMany({ data: { updatedAt: new Date(Date.now() - 11 * 60_000) } });
    expect(await getDriverPositionForCustomer(w.customer, id)).toBeNull(); // stale positions are hidden
    expect(await shareLocation(d, 30.05, 31.24)).toEqual({ ok: true });
    expect((await deliver(d, id, { feeCollected: true, code: await codeOf(id) })).ok).toBe(true);
    expect(await db.driverLocation.count()).toBe(0); // nothing left to deliver: nothing kept
    await claimOrder(d, await approvedOrder());
    expect(await shareLocation(d, 30.04, 31.23)).toEqual({ ok: true });
    await stopSharing(d);
    expect(await db.driverLocation.count()).toBe(0);
  });
});

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
  it("a driver sets availability; shops see only drivers taking work, with AVAILABLE or ON_TRIP; shops cannot create drivers", async () => {
    const d = await driverOf(w.owner, w.shopId, false);
    expect(await getMyAvailability(d.actor)).toEqual({ status: "OFFLINE", isOnline: false });
    expect(await listDriversForShop(w.owner)).toEqual([]);
    await setMyAvailability(d.actor, true);
    expect(await getMyAvailability(d.actor)).toEqual({ status: "AVAILABLE", isOnline: true });
    expect((await listDriversForShop(w.owner)).map((x) => ({ id: x.id, status: x.status }))).toEqual([{ id: d.driverId, status: "AVAILABLE" }]);
    expect((await listDriversForShop(w.otherOwner)).length).toBe(1); // independent: every shop sees the same drivers
    const id = await approvedOrder();
    expect((await assignDriver(w.owner, id, d.driverId)).ok).toBe(true);
    expect((await listDriversForShop(w.owner))[0]).toMatchObject({ status: "ON_TRIP" });
    expect(await getMyAvailability(d.actor)).toEqual({ status: "ON_TRIP", isOnline: true });
    await setMyAvailability(d.actor, false);
    expect(await listDriversForShop(w.owner)).toEqual([]);
    expect(await db.auditLog.count({ where: { action: "DRIVER_AVAILABILITY_CHANGED" } })).toBe(2);
    await expect(setMyAvailability(w.owner, true)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(listDriversForShop(w.customer)).rejects.toBeInstanceOf(AuthorizationError);
    await db.driver.update({ where: { id: d.driverId }, data: { isActive: false } });
    await expect(setMyAvailability(d.actor, true)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

async function driverOf(owner: Actor, shopId: string, isOnline = true): Promise<{ actor: Actor; driverId: string }> {
  const actor = await user("DRIVER");
  const d = await db.driver.create({ data: { userId: actor.id, merchantId: null, isOnline, ...(isOnline ? { lastSeenAt: new Date() } : {}) } });
  void owner;
  void shopId;
  return { actor, driverId: d.id };
}

describe("delivery", () => {
  it("assign -> pickup -> deliver: states follow, the cash fee is recorded, nothing repeats", async () => {
    const id = await approvedOrder();
    const d = await driverOf(w.owner, w.shopId);
    expect((await assignDriver(w.owner, id, d.driverId)).ok).toBe(true);
    expect((await db.order.findUniqueOrThrow({ where: { id } })).deliveryStatus).toBe("DRIVER_ASSIGNED");
    expect(await pickUp(d.actor, id)).toEqual({ ok: false, error: "FEE_NOT_APPROVED" }); // a shop-sent order also needs the customer's agreement on the price
    await agreeFee(d.actor, id);
    expect(await pickUp(d.actor, id)).toEqual({ ok: false, error: "WRONG_STATE" }); // the shop has not finished preparing
    await advanceOrder(w.owner, id, "PREPARING");
    await advanceOrder(w.owner, id, "READY");
    expect((await pickUp(d.actor, id)).ok).toBe(true);
    expect(await status(id)).toBe("OUT_FOR_DELIVERY");
    expect(await pickUp(d.actor, id)).toEqual({ ok: false, error: "WRONG_STATE" });
    expect(await advanceOrder(w.owner, id, "DELIVERED")).toEqual({ ok: false, error: "WRONG_STATE" }); // only the driver confirms delivery now
    expect(await deliver(d.actor, id, { feeCollected: false, code: await codeOf(id) })).toEqual({ ok: false, error: "INVALID_REQUEST" });

    // The customer-only handover code: wrong or missing code is refused, five wrong tries lock the order (even for the right code).
    const right = (await codeOf(id))!;
    expect(right).toMatch(/^\d{4}$/);
    const wrong = right === "0000" ? "1111" : "0000";
    expect(await deliver(d.actor, id, { feeCollected: true })).toEqual({ ok: false, error: "INVALID_CODE" });
    expect(await deliver(d.actor, id, { feeCollected: true, code: wrong })).toEqual({ ok: false, error: "INVALID_CODE" });
    expect(await status(id)).toBe("OUT_FOR_DELIVERY");
    expect((await db.notification.findFirstOrThrow({ where: { userId: w.customer.id, type: "ORDER_OUT_FOR_DELIVERY" } })).body).toContain(right);
    for (let i = 0; i < 3; i++) await deliver(d.actor, id, { feeCollected: true, code: wrong });
    expect(await deliver(d.actor, id, { feeCollected: true, code: right })).toEqual({ ok: false, error: "TOO_MANY_ATTEMPTS" });
    await db.rateLimitHit.deleteMany({ where: { key: `delivery-code:${id}` } }); // the lock lasts 15 minutes; clear it for the rest of this test

    const both = await Promise.all([deliver(d.actor, id, { feeCollected: true, code: await codeOf(id) }), deliver(d.actor, id, { feeCollected: true, code: await codeOf(id) })]);
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
    await agreeFee(d.actor, id);
    await advanceOrder(w.owner, id, "PREPARING");
    await advanceOrder(w.owner, id, "READY");
    await pickUp(d.actor, id);
    expect((await deliver(d.actor, id, { feeCollected: false, note: "العميل رفض الدفع", code: await codeOf(id) })).ok).toBe(true);
    expect(await db.deliveryRecord.findUniqueOrThrow({ where: { orderId: id } })).toMatchObject({ collectionStatus: "EXCEPTION", exceptionNote: "العميل رفض الدفع" });
  });

  it("only an online, active, verified driver who is not on another trip can be sent an order; others cannot see or act on it", async () => {
    const id = await approvedOrder();
    const other = await driverOf(w.otherOwner, w.otherShopId);
    const mine = await driverOf(w.owner, w.shopId);
    await setMyAvailability(mine.actor, false);
    expect(await assignDriver(w.owner, id, mine.driverId)).toEqual({ ok: false, error: "DRIVER_NOT_AVAILABLE" }); // offline
    await setMyAvailability(mine.actor, true);
    await db.driver.update({ where: { id: mine.driverId }, data: { isActive: false } });
    expect(await assignDriver(w.owner, id, mine.driverId)).toEqual({ ok: false, error: "DRIVER_NOT_AVAILABLE" }); // suspended
    await db.driver.update({ where: { id: mine.driverId }, data: { isActive: true } });
    await db.user.update({ where: { id: mine.actor.id }, data: { status: "PENDING" } });
    expect(await assignDriver(w.owner, id, mine.driverId)).toEqual({ ok: false, error: "DRIVER_NOT_AVAILABLE" });
    await db.user.update({ where: { id: mine.actor.id }, data: { status: "ACTIVE" } });
    await expect(assignDriver(w.otherOwner, id, other.driverId)).rejects.toBeInstanceOf(NotFoundError); // not their order
    await expect(assignDriver(w.customer, id, mine.driverId)).rejects.toBeInstanceOf(NotFoundError);
    expect((await assignDriver(w.owner, id, mine.driverId)).ok).toBe(true);
    expect(await db.notification.count({ where: { userId: mine.actor.id, type: "DELIVERY_ASSIGNED" } })).toBe(1);
    const second = await approvedOrder();
    expect(await assignDriver(w.owner, second, mine.driverId)).toEqual({ ok: false, error: "DRIVER_NOT_AVAILABLE" }); // already on a trip
    await expect(pickUp(other.actor, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(pickUp(w.owner, id)).rejects.toBeInstanceOf(AuthorizationError);
    expect((await listMyDeliveries(other.actor, "ACTIVE")).length).toBe(0);
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
    await agreeFee(d1.actor, id);
    await advanceOrder(w.owner, id, "PREPARING");
    await advanceOrder(w.owner, id, "READY");
    await pickUp(d1.actor, id);
    expect(await reportFailure(d1.actor, id, "")).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect((await reportFailure(d1.actor, id, "العميل مش بيرد")).ok).toBe(true);
    expect(await db.notification.count({ where: { userId: w.owner.id, type: "DELIVERY_FAILED" } })).toBe(1);
    expect(await deliver(d1.actor, id, { feeCollected: true, code: await codeOf(id) })).toEqual({ ok: false, error: "WRONG_STATE" });
    expect((await assignDriver(w.owner, id, d2.driverId)).ok).toBe(true);
    await agreeFee(d2.actor, id);
    await expect(pickUp(d1.actor, id)).rejects.toBeInstanceOf(NotFoundError); // no longer theirs
    expect((await pickUp(d2.actor, id)).ok).toBe(true);
    expect(await status(id)).toBe("OUT_FOR_DELIVERY"); // moved once, not again
    expect((await deliver(d2.actor, id, { feeCollected: true, code: await codeOf(id) })).ok).toBe(true);
    expect(await db.orderEvent.count({ where: { orderId: id, field: "orderStatus", toValue: "OUT_FOR_DELIVERY" } })).toBe(1);
  });
});

describe("open driver board", () => {
  it("shows only accepted+paid orders, hides the customer's details, and refuses non-drivers", async () => {
    const waiting = await paidOrder(); // paid but the shop has not accepted yet
    const accepted = await approvedOrder();
    const d = await user("DRIVER");
    const rows = await listBoard(d);
    expect(rows.map((r) => r.orderId)).toEqual([accepted]);
    expect(rows[0]).toMatchObject({ shop: "A", zone: "المعادي", feeCents: 2000 });
    expect(JSON.stringify(rows)).not.toContain("شارع 9");
    expect(JSON.stringify(rows)).not.toContain("+2015");
    expect(rows.some((r) => r.orderId === waiting)).toBe(false);
    await expect(listBoard(w.customer)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(claimOrder(w.owner, accepted)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("the first driver wins, the shop and customer are told his name, the next driver is told who took it", async () => {
    const id = await approvedOrder();
    const a = await user("DRIVER");
    const b = await user("DRIVER");
    expect(await claimOrder(a, id)).toEqual({ ok: true });
    const first = await db.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(await claimOrder(b, id)).toEqual({ ok: false, error: "TAKEN", takenBy: first.name });
    expect(await claimOrder(a, id)).toEqual({ ok: false, error: "TAKEN", takenBy: first.name }); // not twice
    expect((await listBoard(b)).length).toBe(0);
    const row = await db.order.findUniqueOrThrow({ where: { id } });
    expect(row.deliveryStatus).toBe("DRIVER_ASSIGNED");
    for (const userId of [w.owner.id, w.customer.id]) {
      const notes = await db.notification.findMany({ where: { userId, type: "DELIVERY_ASSIGNED" } });
      expect(notes.some((x) => x.body.includes(first.name))).toBe(true);
    }
    expect(await db.auditLog.count({ where: { action: "DELIVERY_CLAIMED", entityId: id } })).toBe(1);
    expect(await db.deliveryRecord.count({ where: { orderId: id } })).toBe(1);
  });

  it("simultaneous drivers: exactly one gets the order, every other one is told the same name", async () => {
    const id = await approvedOrder();
    const drivers = await Promise.all([user("DRIVER"), user("DRIVER"), user("DRIVER"), user("DRIVER")]);
    const results = await Promise.all(drivers.map((d) => claimOrder(d, id)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const winner = drivers[results.findIndex((r) => r.ok)]!;
    const winnerName = (await db.user.findUniqueOrThrow({ where: { id: winner.id } })).name;
    for (const r of results) if (!r.ok) expect(r).toMatchObject({ error: "TAKEN", takenBy: winnerName });
    expect(await db.notification.count({ where: { userId: w.customer.id, type: "DELIVERY_ASSIGNED" } })).toBe(1);
  });

  it("a driver may hold any number of orders; a paused or unverified account cannot claim", async () => {
    const d = await user("DRIVER");
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push(await approvedOrder());
    for (const id of ids.slice(0, 4)) expect(await claimOrder(d, id)).toEqual({ ok: true }); // no fixed limit
    const fifth = ids[4]!;
    expect(await claimOrder(d, fifth)).toEqual({ ok: true });
    const paused = await user("DRIVER");
    await db.driver.create({ data: { userId: paused.id, merchantId: null, isActive: false } });
    await expect(claimOrder(paused, fifth)).rejects.toBeInstanceOf(AuthorizationError);
    const pending = await user("DRIVER");
    await db.user.update({ where: { id: pending.id }, data: { status: "PENDING" } });
    await expect(claimOrder(pending, fifth)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("releasing puts the order back on the board for others; only the holder can release, and not after pickup", async () => {
    const id = await approvedOrder();
    const a = await user("DRIVER");
    const b = await user("DRIVER");
    await claimOrder(a, id);
    await expect(releaseOrder(b, id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await releaseOrder(a, id)).toEqual({ ok: true });
    expect((await listBoard(b)).map((r) => r.orderId)).toEqual([id]);
    expect(await claimOrder(b, id)).toEqual({ ok: true });
    await expect(releaseOrder(a, id)).rejects.toBeInstanceOf(NotFoundError); // no longer hers
    await advanceOrder(w.owner, id, "PREPARING");
    await advanceOrder(w.owner, id, "READY");
    await agreeFee(b, id);
    expect((await pickUp(b, id)).ok).toBe(true);
    expect(await releaseOrder(b, id)).toEqual({ ok: false, error: "WRONG_STATE" });
  });

  it("the driver names the price, the customer must approve it before pickup; a refusal sends the order back to the board", async () => {
    const id = await approvedOrder();
    const a = await user("DRIVER");
    const b = await user("DRIVER");
    await claimOrder(a, id);
    await advanceOrder(w.owner, id, "PREPARING");
    await advanceOrder(w.owner, id, "READY");
    expect(await pickUp(a, id)).toEqual({ ok: false, error: "FEE_NOT_APPROVED" });
    expect(await proposeDeliveryFee(a, id, 50)).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await proposeDeliveryFee(a, id, 1_000_000)).toEqual({ ok: false, error: "FEE_TOO_HIGH" }); // above the 1,000 EGP typo guard -> at most 5000
    expect(await proposeDeliveryFee(a, id, 3500)).toEqual({ ok: true });
    expect(await pickUp(a, id)).toEqual({ ok: false, error: "FEE_NOT_APPROVED" }); // proposed is not approved
    await expect(answerDeliveryFee(await user("CUSTOMER"), id, true)).rejects.toBeInstanceOf(NotFoundError); // only this order's customer
    expect(await answerDeliveryFee(w.customer, id, false)).toEqual({ ok: true });
    expect(await db.deliveryRecord.findUniqueOrThrow({ where: { orderId: id } })).toMatchObject({ driverId: null, feeStatus: "NONE", feeExpectedCents: 2000 });
    expect((await listBoard(b)).map((r) => r.orderId)).toContain(id);
    expect(await claimOrder(b, id)).toEqual({ ok: true });
    await agreeFee(b, id, 3000);
    expect(await db.deliveryRecord.findUniqueOrThrow({ where: { orderId: id } })).toMatchObject({ feeStatus: "APPROVED", feeExpectedCents: 3000 });
    expect(await answerDeliveryFee(w.customer, id, true)).toEqual({ ok: false, error: "WRONG_STATE" }); // nothing left to answer
    expect((await pickUp(b, id)).ok).toBe(true);
  });

  it("the holder completes the delivery and alone sees the customer's address and phone", async () => {
    const id = await approvedOrder();
    const a = await user("DRIVER");
    const b = await user("DRIVER");
    await claimOrder(a, id);
    await advanceOrder(w.owner, id, "PREPARING");
    await advanceOrder(w.owner, id, "READY");
    await expect(pickUp(b, id)).rejects.toBeInstanceOf(AuthorizationError); // b has never held an order, so no driver profile exists yet
    expect(await listMyDeliveries(b, "ACTIVE")).toEqual([]);
    await agreeFee(a, id);
    expect((await pickUp(a, id)).ok).toBe(true);
    const mine = await listMyDeliveries(a, "ACTIVE");
    expect(mine[0]).toMatchObject({ orderId: id, address: expect.objectContaining({ line: "شارع 9" }) });
    expect((await deliver(a, id, { feeCollected: true, code: await codeOf(id) })).ok).toBe(true);
    expect((await db.order.findUniqueOrThrow({ where: { id } })).orderStatus).toBe("DELIVERED");
    expect((await db.deliveryRecord.findUniqueOrThrow({ where: { orderId: id } })).collectionStatus).toBe("COLLECTED");
  });
});

describe("delivery timeouts", () => {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

  it("a driver who does not name a price in time loses the order; everyone is told once; fresh ones are left alone", async () => {
    const stale = await approvedOrder();
    const fresh = await approvedOrder();
    const d1 = await driverOf(w.owner, w.shopId);
    const d2 = await driverOf(w.owner, w.shopId);
    await assignDriver(w.owner, stale, d1.driverId);
    await assignDriver(w.owner, fresh, d2.driverId);
    await db.deliveryRecord.update({ where: { orderId: stale }, data: { assignedAt: minutesAgo(11) } });
    expect(await sweepDeliveryTimeouts()).toEqual({ released: 1 });
    expect(await db.order.findUniqueOrThrow({ where: { id: stale } })).toMatchObject({ deliveryStatus: "AWAITING_DRIVER" });
    expect(await db.deliveryRecord.findUniqueOrThrow({ where: { orderId: stale } })).toMatchObject({ driverId: null, feeStatus: "NONE" });
    expect((await db.order.findUniqueOrThrow({ where: { id: fresh } })).deliveryStatus).toBe("DRIVER_ASSIGNED");
    expect(await db.notification.count({ where: { userId: w.owner.id, type: "DELIVERY_FAILED", dedupeKey: { startsWith: "delivery-timeout-shop:" } } })).toBe(1);
    expect(await db.notification.count({ where: { userId: d1.actor.id, dedupeKey: { startsWith: "delivery-timeout-driver:" } } })).toBe(1);
    expect(await sweepDeliveryTimeouts()).toEqual({ released: 0 }); // nothing repeats
    expect((await assignDriver(w.owner, stale, d1.driverId)).ok).toBe(true); // the shop can send it again
  });

  it("a customer who does not answer the price in time: the order goes back to the board and the customer is told", async () => {
    const id = await approvedOrder();
    const d = await driverOf(w.owner, w.shopId);
    await assignDriver(w.owner, id, d.driverId);
    expect(await proposeDeliveryFee(d.actor, id, 2000)).toEqual({ ok: true });
    await db.deliveryRecord.update({ where: { orderId: id }, data: { feeProposedAt: minutesAgo(5) } });
    expect(await sweepDeliveryTimeouts()).toEqual({ released: 0 });
    await db.deliveryRecord.update({ where: { orderId: id }, data: { feeProposedAt: minutesAgo(31) } });
    expect(await sweepDeliveryTimeouts()).toEqual({ released: 1 });
    expect((await db.order.findUniqueOrThrow({ where: { id } })).deliveryStatus).toBe("AWAITING_DRIVER");
    expect(await db.notification.count({ where: { userId: w.customer.id, dedupeKey: { startsWith: "delivery-timeout-customer:" } } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "DELIVERY_TIMED_OUT", entityId: id } })).toBe(1);
  });

  it("an order the customer already agreed to is never pulled back", async () => {
    const id = await approvedOrder();
    const d = await driverOf(w.owner, w.shopId);
    await assignDriver(w.owner, id, d.driverId);
    await agreeFee(d.actor, id);
    await db.deliveryRecord.update({ where: { orderId: id }, data: { assignedAt: minutesAgo(120), feeProposedAt: minutesAgo(120) } });
    expect(await sweepDeliveryTimeouts()).toEqual({ released: 0 });
  });
});

describe("driver availability lapses", () => {
  it("after a few idle hours the driver is no longer available until they switch it on again", async () => {
    const id = await approvedOrder();
    const d = await driverOf(w.owner, w.shopId);
    await db.driver.update({ where: { id: d.driverId }, data: { lastSeenAt: new Date(Date.now() - 4 * 3_600_000) } });
    expect(await listDriversForShop(w.owner)).toEqual([]);
    expect(await getMyAvailability(d.actor)).toEqual({ status: "OFFLINE", isOnline: false });
    expect(await assignDriver(w.owner, id, d.driverId)).toEqual({ ok: false, error: "DRIVER_NOT_AVAILABLE" });
    await setMyAvailability(d.actor, true);
    expect(await getMyAvailability(d.actor)).toEqual({ status: "AVAILABLE", isOnline: true });
    expect((await assignDriver(w.owner, id, d.driverId)).ok).toBe(true);
  });
});

describe("notification emails", () => {
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  let failing = false;
  const sender: NoticeSender = {
    async send(to, subject, text) {
      if (failing) throw new Error("provider down");
      sent.push({ to, subject, text });
      return true;
    },
  };

  it("order updates go to verified emails once; chat stays in the app; failures retry a few times then stop", async () => {
    sent.length = 0;
    failing = false;
    setNoticeSenderForTests(sender);
    try {
      await db.user.update({ where: { id: w.customer.id }, data: { email: "buyer@example.com", emailVerifiedAt: new Date() } });
      await db.notification.create({ data: { userId: w.customer.id, type: "CHAT_MESSAGE", title: "رسالة", body: "x", dedupeKey: "chat-1" } });
      await approvedOrder(); // tells the customer
      const first = await flushNotificationEmails();
      expect(first.failed).toBe(0);
      expect(await db.notification.count({ where: { userId: w.customer.id, type: "ORDER_APPROVED" } })).toBe(1);
      expect(first.sent).toBeGreaterThan(0);
      expect(sent.every((m) => m.to === "buyer@example.com" && m.text.length > 0)).toBe(true);
      expect(await db.notification.count({ where: { type: "CHAT_MESSAGE", emailedAt: { not: null } } })).toBe(0);
      expect(await flushNotificationEmails()).toEqual({ sent: 0, failed: 0 }); // already sent: nothing repeats
      // An unverified address gets nothing.
      await db.user.update({ where: { id: w.customer.id }, data: { emailVerifiedAt: null } });
      await approvedOrder();
      sent.length = 0;
      expect(await flushNotificationEmails()).toEqual({ sent: 0, failed: 0 });
      // Provider failures: retried, then given up.
      await db.user.update({ where: { id: w.customer.id }, data: { emailVerifiedAt: new Date() } });
      failing = true;
      await approvedOrder();
      for (let i = 0; i < 4; i++) await flushNotificationEmails();
      expect(await db.notification.count({ where: { emailedAt: null, emailTries: 3, type: { startsWith: "ORDER_APPROVED" }, dedupeKey: { not: { in: [] } } } })).toBeGreaterThan(1); // the unverified one was skipped; the new one was tried 3 times
      expect(await db.notification.count({ where: { emailTries: { gt: 3 } } })).toBe(0);
    } finally {
      setNoticeSenderForTests(undefined);
    }
  });
});

describe("board announcements", () => {
  it("available drivers hear about a new board order once; offline and busy drivers do not", async () => {
    const id = await approvedOrder();
    const free = await driverOf(w.owner, w.shopId);
    const off = await driverOf(w.owner, w.shopId, false);
    const busy = await driverOf(w.owner, w.shopId);
    const other = await approvedOrder();
    await assignDriver(w.owner, other, busy.driverId);
    expect(await announceBoardOrders()).toEqual({ notified: 1 });
    expect(await db.notification.count({ where: { userId: free.actor.id, type: "DELIVERY_AVAILABLE", dedupeKey: `board:${id}:${free.actor.id}` } })).toBe(1);
    expect(await db.notification.count({ where: { userId: { in: [off.actor.id, busy.actor.id] }, type: "DELIVERY_AVAILABLE" } })).toBe(0);
    expect(await announceBoardOrders()).toEqual({ notified: 0 }); // nothing repeats
  });
});

describe("no delivery zones", () => {
  it("a customer who just types and pins an address can order; the driver sees who and where, names the price and the customer agrees", async () => {
    const saved = await createAddress(w.customer, { line: "شارع التحرير 12 الدقي", lat: 30.0384, lng: 31.2117 }); // no zone, no fee table
    expect(saved.ok).toBe(true);
    const addressId = (saved as { addressId: string }).addressId;
    const before = w.addressId;
    w.addressId = addressId;
    let id: string;
    try {
      id = await approvedOrder();
    } finally {
      w.addressId = before;
    }
    expect((await db.order.findUniqueOrThrow({ where: { id } })).deliveryFeeCents).toBe(0);
    const d = await driverOf(w.owner, w.shopId);
    expect((await assignDriver(w.owner, id, d.driverId)).ok).toBe(true);
    const row = (await listMyDeliveries(d.actor, "ACTIVE"))[0]!;
    expect(row.customer.phone.length).toBeGreaterThan(5);
    expect(row.address).toMatchObject({ line: "شارع التحرير 12 الدقي", lat: 30.0384, lng: 31.2117 });
    expect(await proposeDeliveryFee(d.actor, id, 100_001)).toEqual({ ok: false, error: "FEE_TOO_HIGH" });
    expect(await proposeDeliveryFee(d.actor, id, 3500)).toEqual({ ok: true });
    expect((await answerDeliveryFee(w.customer, id, true)).ok).toBe(true);
    expect(await db.deliveryRecord.findUniqueOrThrow({ where: { orderId: id } })).toMatchObject({ feeStatus: "APPROVED", feeExpectedCents: 3500 });
  });
});
