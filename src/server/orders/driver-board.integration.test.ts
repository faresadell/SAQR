/**
 * Open driver board (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { invalidateSettingsCache } from "@/lib/settings";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { placeOrder } from "@/server/orders/checkout";
import { deliver, listMyDeliveries, pickUp } from "@/server/orders/delivery";
import { claimOrder, listBoard, MAX_ACTIVE_DELIVERIES, releaseOrder } from "@/server/orders/driver-board";
import { advanceOrder, confirmPayment, decideOrder, submitPayment } from "@/server/orders/lifecycle";
import { applyStarMove } from "@/server/stars/ledger";

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

  it("a driver cannot hold more than the cap; a paused or unverified account cannot claim", async () => {
    const d = await user("DRIVER");
    const ids: string[] = [];
    for (let i = 0; i < MAX_ACTIVE_DELIVERIES + 1; i += 1) ids.push(await approvedOrder());
    for (const id of ids.slice(0, MAX_ACTIVE_DELIVERIES)) expect(await claimOrder(d, id)).toEqual({ ok: true });
    expect(await claimOrder(d, ids[MAX_ACTIVE_DELIVERIES]!)).toEqual({ ok: false, error: "TOO_MANY_ACTIVE" });
    const paused = await user("DRIVER");
    await db.driver.create({ data: { userId: paused.id, merchantId: null, isActive: false } });
    await expect(claimOrder(paused, ids[MAX_ACTIVE_DELIVERIES]!)).rejects.toBeInstanceOf(AuthorizationError);
    const pending = await user("DRIVER");
    await db.user.update({ where: { id: pending.id }, data: { status: "PENDING" } });
    await expect(claimOrder(pending, ids[MAX_ACTIVE_DELIVERIES]!)).rejects.toBeInstanceOf(AuthorizationError);
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
    expect((await pickUp(b, id)).ok).toBe(true);
    expect(await releaseOrder(b, id)).toEqual({ ok: false, error: "WRONG_STATE" });
  });

  it("the holder completes the delivery and alone sees the customer's address and phone", async () => {
    const id = await approvedOrder();
    const a = await user("DRIVER");
    const b = await user("DRIVER");
    await claimOrder(a, id);
    await advanceOrder(w.owner, id, "PREPARING");
    await advanceOrder(w.owner, id, "READY");
    await expect(pickUp(b, id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listMyDeliveries(b, "ACTIVE")).toEqual([]);
    expect((await pickUp(a, id)).ok).toBe(true);
    const mine = await listMyDeliveries(a, "ACTIVE");
    expect(mine[0]).toMatchObject({ orderId: id, address: expect.objectContaining({ line: "شارع 9" }) });
    expect((await deliver(a, id, { feeCollected: true })).ok).toBe(true);
    expect((await db.order.findUniqueOrThrow({ where: { id } })).orderStatus).toBe("DELIVERED");
    expect((await db.deliveryRecord.findUniqueOrThrow({ where: { orderId: id } })).collectionStatus).toBe("COLLECTED");
  });
});
