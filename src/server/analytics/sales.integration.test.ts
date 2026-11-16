/**
 * Analytics integration tests (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { world, type World } from "@/test-support/orders-world";
import { db } from "@/lib/db";
import { invalidateSettingsCache } from "@/lib/settings";
import { AuthorizationError } from "@/server/errors";
import { merchantAnalytics, platformAnalytics, salesAnalytics } from "@/server/analytics/sales";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

let w: World;
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "Coupon","ParentOrder","Order","StarLedgerEntry","StarAccount","PlatformSettingVersion","CommissionRate","PaymentMethodConfig","DeliveryFeeVersion","DeliveryZone","BusinessType","Category","AuditLog","Notification","ReceiptUpload","User" RESTART IDENTITY CASCADE',
  );
  invalidateSettingsCache();
  w = await world();
});

async function order(merchantId: string, status: "DELIVERED" | "CANCELLED" | "PREPARING", subtotal: number, name: string, qty: number, discount = 0) {
  return db.order.create({
    data: {
      customerId: w.customer.id, merchantId, orderStatus: status, subtotalCents: subtotal, discountCents: discount, deliveryFeeCents: 0, totalCents: subtotal - discount,
      merchantTierSnap: "REGULAR", commissionBp: 0, commissionBaseCents: subtotal, commissionCents: 0, deliveryRuleSnap: {}, addressSnap: {},
      items: { create: [{ nameSnapshot: name, unitPriceCents: subtotal / qty, quantity: qty, lineTotalCents: subtotal }] },
    },
  });
}

describe("sales analytics", () => {
  it("counts only real orders of the scope: revenue after coupons, top products, returning customers", async () => {
    await order(w.a.merchant.id, "DELIVERED", 10_000, "برجر", 2, 1_000);
    await order(w.a.merchant.id, "DELIVERED", 5_000, "برجر", 1);
    await order(w.a.merchant.id, "CANCELLED", 7_000, "بيتزا", 1);
    await order(w.a.merchant.id, "PREPARING", 2_000, "عصير", 1);
    await order(w.b.merchant.id, "DELIVERED", 99_000, "شاورما", 3);

    const a = await salesAnalytics(w.a.merchant.id);
    expect([a.orders, a.delivered, a.cancelled, a.open]).toEqual([4, 2, 1, 1]);
    expect(a.revenueCents).toBe(14_000); // (10000 - 1000) + 5000
    expect(a.averageOrderCents).toBe(7_000);
    expect(a.topProducts).toEqual([{ name: "برجر", units: 3, revenueCents: 15_000 }]);
    expect([a.customers, a.returningCustomers]).toEqual([1, 1]);
    expect(a.daily).toHaveLength(30);
    expect(a.daily.reduce((n, d) => n + d.orders, 0)).toBe(3); // delivered + open, not cancelled
    expect(a.daily.reduce((n, d) => n + d.revenueCents, 0)).toBe(14_000);

    expect((await salesAnalytics(null)).revenueCents).toBe(113_000); // whole platform
    expect((await salesAnalytics(w.b.merchant.id)).revenueCents).toBe(99_000);
  });

  it("an empty shop shows zeros and no average, and only the right people can look", async () => {
    const a = await salesAnalytics(w.a.merchant.id);
    expect([a.orders, a.revenueCents, a.averageOrderCents, a.topProducts.length]).toEqual([0, 0, null, 0]);
    expect((await merchantAnalytics(w.ownerA)).rating).toEqual({ average: null, count: 0 });
    await expect(merchantAnalytics(w.customer)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(platformAnalytics(w.ownerA)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
