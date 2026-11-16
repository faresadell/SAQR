/**
 * Analytics integration tests (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { world, type World } from "@/test-support/orders-world";
import { db } from "@/lib/db";
import { invalidateSettingsCache } from "@/lib/settings";
import { AuthorizationError } from "@/server/errors";
import { driverAnalytics } from "./driver";
import { merchantAnalytics } from "./merchant";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

let w: World;
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "Coupon","ParentOrder","Order","StarLedgerEntry","StarAccount","PlatformSettingVersion","CommissionRate","PaymentMethodConfig","DeliveryFeeVersion","DeliveryZone","BusinessType","Category","AuditLog","Notification","ReceiptUpload","User" RESTART IDENTITY CASCADE',
  );
  invalidateSettingsCache();
  w = await world();
});

async function finishedOrder(merchantId: string, productId: string, status: "DELIVERED" | "CANCELLED", subtotal: number, discount = 0, daysAgo = 1) {
  const order = await db.order.create({
    data: { customerId: w.customer.id, merchantId, orderStatus: status, subtotalCents: subtotal, discountCents: discount, deliveryFeeCents: 0, totalCents: subtotal - discount, merchantTierSnap: "REGULAR", commissionBp: 0, commissionBaseCents: subtotal, commissionCents: 0, deliveryRuleSnap: {}, addressSnap: {} },
  });
  await db.orderItem.create({ data: { orderId: order.id, productId, nameSnapshot: "منتج", unitPriceCents: subtotal, quantity: 1, lineTotalCents: subtotal } });
  await db.orderEvent.create({ data: { orderId: order.id, field: "orderStatus", toValue: status, createdAt: new Date(Date.now() - daysAgo * 86_400_000) } });
  return order;
}

describe("merchant analytics", () => {
  it("counts only this shop's delivered orders in the last 30 days, net of coupons, and never invents a number", async () => {
    const empty = await merchantAnalytics(w.ownerA);
    expect([empty.deliveredOrders, empty.salesCents, empty.averageOrderCents, empty.cancelRatePercent, empty.rating.average]).toEqual([0, 0, null, null, null]);

    await finishedOrder(w.a.merchant.id, w.a.product.id, "DELIVERED", 10_000, 1_000);
    await finishedOrder(w.a.merchant.id, w.a.product.id, "DELIVERED", 5_000);
    await finishedOrder(w.a.merchant.id, w.a.product.id, "CANCELLED", 3_000);
    await finishedOrder(w.a.merchant.id, w.a.product.id, "DELIVERED", 7_000, 0, 45); // too old
    await finishedOrder(w.b.merchant.id, w.b.product.id, "DELIVERED", 99_000); // another shop

    const a = await merchantAnalytics(w.ownerA);
    expect([a.deliveredOrders, a.salesCents, a.averageOrderCents, a.couponDiscountCents]).toEqual([2, 14_000, 7_000, 1_000]);
    expect([a.cancelledOrders, a.cancelRatePercent]).toEqual([1, 33]);
    expect(a.topProducts[0]).toMatchObject({ name: "منتج", quantity: 2 });
    expect(a.daily.reduce((n, d) => n + d.cents, 0)).toBe(14_000);
    await expect(merchantAnalytics(w.customer)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("driver analytics", () => {
  it("sums approved fees of this driver's deliveries and has no data for a user without a driver profile", async () => {
    const du = await db.user.create({ data: { phone: "+201099999999", name: "مندوب", passwordHash: "x", role: "DRIVER", status: "ACTIVE" } });
    const driver = { id: du.id, role: "DRIVER" as const, isSuperAdmin: false, permissions: [] };
    expect((await driverAnalytics(driver)).deliveries).toBe(0);
    const prof = await db.driver.create({ data: { userId: du.id } });
    const o1 = await finishedOrder(w.a.merchant.id, w.a.product.id, "DELIVERED", 10_000);
    const o2 = await finishedOrder(w.a.merchant.id, w.a.product.id, "DELIVERED", 10_000);
    const t = Date.now();
    await db.deliveryRecord.create({ data: { orderId: o1.id, driverId: prof.id, feeExpectedCents: 3_000, collectionStatus: "COLLECTED", pickedUpAt: new Date(t - 40 * 60_000), deliveredAt: new Date(t - 10 * 60_000) } });
    await db.deliveryRecord.create({ data: { orderId: o2.id, driverId: prof.id, feeExpectedCents: 2_000, pickedUpAt: new Date(t - 50 * 60_000), deliveredAt: new Date(t - 20 * 60_000) } });
    const a = await driverAnalytics(driver);
    expect([a.deliveries, a.feesCents, a.collectedCents, a.averageMinutes]).toEqual([2, 5_000, 3_000, 30]);
  });
});
