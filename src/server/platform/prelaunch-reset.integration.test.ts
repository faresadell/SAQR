/** The pre-launch reset script (scripts/sql/prelaunch-reset.sql) against a real database: admins and configuration stay, everything else goes. */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { placeOrder } from "@/server/orders/checkout";
import { world } from "@/test-support/orders-world";

const reset = readFileSync("scripts/sql/prelaunch-reset.sql", "utf8");
const preview = readFileSync("scripts/sql/prelaunch-preview.sql", "utf8");

// Tables the script keeps; every other table must be in its TRUNCATE list.
const KEPT = ["User", "Session", "AdminPermission", "AdminRecoveryCode", "EmailCode", "UserAvatar", "BusinessType", "Category", "DeliveryZone", "DeliveryFeeVersion", "PlatformSetting", "PlatformSettingVersion", "PaymentMethodConfig", "CommissionRate", "StarPackage", "Plan", "MembershipPlan", "LegalPage", "AuditLog", "_prisma_migrations"];

beforeEach(async () => {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(",")} RESTART IDENTITY CASCADE`);
});

describe("pre-launch reset", () => {
  it("covers every table: new models must be classified as kept or wiped", async () => {
    const tables = (await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`).map((t) => t.tablename);
    const unclassified = tables.filter((t) => !KEPT.includes(t) && !reset.includes(`"${t}"`));
    expect(unclassified).toEqual([]);
  });

  it("keeps admins and configuration, removes every other account and all data under them", async () => {
    const w = await world();
    const admin = await db.user.create({ data: { phone: "+201099999999", name: "المدير", passwordHash: "hash", role: "ADMIN", status: "ACTIVE", isSuperAdmin: true } });
    await db.adminPermission.create({ data: { userId: admin.id, permission: "settings.manage" } });
    await db.session.create({ data: { userId: admin.id, tokenHash: "admin-session", expiresAt: new Date(Date.now() + 86_400_000) } });
    await db.userAvatar.create({ data: { userId: admin.id, bytes: Buffer.from([1, 2, 3]) } });
    await db.auditLog.create({ data: { actorId: admin.id, action: "TEST", entityType: "X", entityId: "1" } });
    const placed = await placeOrder(w.customer, { idempotencyKey: "key-reset-0001", addressId: w.addressId, lines: [{ productId: w.a.product.id, quantity: 1, expectedUnitPriceCents: 5000 }] });
    expect(placed.ok).toBe(true);
    await db.storedFile.create({ data: { key: "product-images/x/y.jpg", bytes: Buffer.from([9]) } });

    const rows = await db.$queryRawUnsafe<{ what: string; n: bigint }[]>(preview);
    expect(rows.find((r) => r.what.startsWith("REMOVE orders"))?.n).toBe(1n);

    await db.$executeRawUnsafe(reset);

    expect(await db.user.findMany({ select: { id: true } })).toEqual([{ id: admin.id }]);
    expect(await db.adminPermission.count()).toBe(1);
    expect(await db.session.count()).toBe(1);
    expect(await db.userAvatar.count()).toBe(1);
    expect(await db.auditLog.count()).toBeGreaterThan(0);
    for (const gone of [db.order, db.parentOrder, db.merchant, db.product, db.address, db.starAccount, db.starLedgerEntry, db.storedFile, db.payment, db.notification]) {
      expect(await (gone as unknown as { count: () => Promise<number> }).count()).toBe(0);
    }
    // configuration survived
    expect(await db.category.count()).toBe(1);
    expect(await db.deliveryZone.count()).toBe(1);
    expect(await db.businessType.count()).toBe(1);
    expect(await db.commissionRate.count()).toBe(2);
    expect(await db.platformSettingVersion.count()).toBeGreaterThan(0);
  });

  it("refuses to run when there is no admin, and changes nothing", async () => {
    const w = await world();
    await expect(db.$executeRawUnsafe(reset)).rejects.toThrow(/No ADMIN user/);
    expect(await db.user.count()).toBe(3);
    expect(w.customer.id).toBeTruthy();
  });
});
