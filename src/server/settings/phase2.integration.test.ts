/**
 * Phase 2 integration tests against a real PostgreSQL database.
 *   DATABASE_URL=postgresql://... npm run test:integration
 * The schema must be applied (prisma db push / migrate) and, for the append-only tests,
 * prisma/manual/001 and 002 SQL files must have been run (CI does both).
 * WARNING: these tests TRUNCATE tables. Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { getSettingAt, invalidateSettingsCache } from "@/lib/settings";
import { buildCommissionSnapshot, CommissionNotConfiguredError, scheduleCommissionRate } from "@/server/commissions/service";
import { createZone, resolveZoneFee, scheduleZoneFee, setZoneActive, ZoneUnavailableError } from "@/server/delivery/zones";
import { AuthorizationError } from "@/server/errors";
import { assertPaymentMethodEnabled, getEnabledPaymentMethods, PaymentMethodDisabledError, setPaymentMethodEnabled, setPaymentReceiver } from "@/server/payments/methods";
import { changeSetting } from "@/server/settings/service";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const admin: Actor = { id: "admin-1", role: "ADMIN", isSuperAdmin: true, permissions: [] };
const viewer: Actor = { id: "viewer-1", role: "ADMIN", isSuperAdmin: false, permissions: ["settings.view"] };
const customer: Actor = { id: "cust-1", role: "CUSTOMER", isSuperAdmin: false, permissions: ["settings.manage"] };

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);
const iso = (d: Date) => d.toISOString();

async function seedRates() {
  const start = new Date("2000-01-01T00:00:00Z");
  await db.commissionRate.createMany({
    data: [
      { tier: "REGULAR", basisPoints: 800, effectiveFrom: start, createdById: "seed" },
      { tier: "BUSINESS", basisPoints: 500, effectiveFrom: start, createdById: "seed" },
    ],
  });
}

async function auditFor(action: string) {
  return db.auditLog.findMany({ where: { action }, orderBy: { createdAt: "asc" } });
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "PlatformSettingVersion","CommissionRate","PaymentMethodConfig","DeliveryFeeVersion","DeliveryZone","AuditLog" RESTART IDENTITY CASCADE',
  );
  invalidateSettingsCache();
});

describe("settings: saving, validation, permissions, audit", () => {
  it("saves a valid value, uses it immediately, and records old/new/actor/effective date", async () => {
    expect(await getSettingAt("refunds.deadline_hours", new Date())).toBe(24); // default
    const result = await changeSetting(admin, "refunds.deadline_hours", "12");
    expect(result.ok).toBe(true);
    expect(await getSettingAt("refunds.deadline_hours", new Date())).toBe(12);

    const [entry] = await auditFor("SETTING_CHANGED");
    expect(entry?.actorId).toBe("admin-1");
    expect(entry?.entityId).toBe("refunds.deadline_hours");
    expect((entry?.before as { value: number }).value).toBe(24);
    expect((entry?.after as { value: number; effectiveFrom: string }).value).toBe(12);
    expect(typeof (entry?.after as { effectiveFrom: string }).effectiveFrom).toBe("string");
  });

  it("rejects invalid values, unknown keys and out-of-range values without writing anything", async () => {
    for (const [key, value] of [
      ["refunds.deadline_hours", "25"], // above the agreed 24h ceiling
      ["refunds.deadline_hours", "abc"],
      ["refunds.deadline_hours", "-1"],
      ["stars.min_balance_customer", "51"],
      ["not.a.setting", "1"],
    ] as const) {
      expect((await changeSetting(admin, key, value)).ok).toBe(false);
    }
    expect(await db.platformSettingVersion.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("lets the merchant response window stay unset and then be set", async () => {
    expect(await getSettingAt("orders.merchant_response_minutes", new Date())).toBeNull();
    expect((await changeSetting(admin, "orders.merchant_response_minutes", "30")).ok).toBe(true);
    expect(await getSettingAt("orders.merchant_response_minutes", new Date())).toBe(30);
  });

  it("denies users without settings.manage, and writes nothing", async () => {
    await expect(changeSetting(viewer, "refunds.deadline_hours", "12")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(changeSetting(customer, "refunds.deadline_hours", "12")).rejects.toBeInstanceOf(AuthorizationError);
    expect(await db.platformSettingVersion.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("schedules a future change: the old value holds until the effective date", async () => {
    const when = inDays(7);
    expect((await changeSetting(admin, "refunds.deadline_hours", "12", iso(when))).ok).toBe(true);
    expect(await getSettingAt("refunds.deadline_hours", new Date())).toBe(24);
    expect(await getSettingAt("refunds.deadline_hours", new Date(when.getTime() + 1000))).toBe(12);
  });

  it("refuses retroactive effective dates", async () => {
    const r = await changeSetting(admin, "refunds.deadline_hours", "12", iso(inDays(-1)));
    expect(r.ok).toBe(false);
    expect(await db.platformSettingVersion.count()).toBe(0);
  });
});

describe("commissions: 8% Basic, 5% Premium, effective dates, old orders never change", () => {
  it("prices a Basic order at 8% and a Premium order at 5% of the PRODUCT amount", async () => {
    await seedRates();
    const basic = await buildCommissionSnapshot("REGULAR", 10_000);
    const premium = await buildCommissionSnapshot("BUSINESS", 10_000);
    expect([basic.commissionBp, basic.commissionCents, basic.commissionBaseCents]).toEqual([800, 800, 10_000]);
    expect([premium.commissionBp, premium.commissionCents, premium.commissionBaseCents]).toEqual([500, 500, 10_000]);
    expect(basic.merchantTierSnap).toBe("REGULAR");
    expect(premium.merchantTierSnap).toBe("BUSINESS");
  });

  it("fails closed when no rate is configured", async () => {
    await expect(buildCommissionSnapshot("REGULAR", 10_000)).rejects.toBeInstanceOf(CommissionNotConfiguredError);
  });

  it("a scheduled rate does not touch current or past pricing, only prices from its date", async () => {
    await seedRates();
    const orderTime = new Date();
    const oldOrder = await buildCommissionSnapshot("REGULAR", 25_000, orderTime); // an order created today

    const when = inDays(30);
    expect((await scheduleCommissionRate(admin, "REGULAR", 700, iso(when))).ok).toBe(true);

    // Today still 8%, and recomputing for the order's own moment gives the identical snapshot.
    expect((await buildCommissionSnapshot("REGULAR", 25_000)).commissionBp).toBe(800);
    const recomputed = await buildCommissionSnapshot("REGULAR", 25_000, orderTime);
    expect(recomputed.commissionCents).toBe(oldOrder.commissionCents);
    expect(oldOrder.commissionCents).toBe(2_000);

    // From the effective date on: 7%. Premium is untouched.
    expect((await buildCommissionSnapshot("REGULAR", 25_000, new Date(when.getTime() + 1000))).commissionBp).toBe(700);
    expect((await buildCommissionSnapshot("BUSINESS", 25_000, new Date(when.getTime() + 1000))).commissionBp).toBe(500);
  });

  it("records old and new rate, actor and effective date in the audit log", async () => {
    await seedRates();
    const when = inDays(3);
    await scheduleCommissionRate(admin, "BUSINESS", 450, iso(when));
    const [entry] = await auditFor("COMMISSION_RATE_SCHEDULED");
    expect(entry?.actorId).toBe("admin-1");
    expect(entry?.entityId).toBe("BUSINESS");
    expect((entry?.before as { basisPoints: number }).basisPoints).toBe(500);
    expect((entry?.after as { basisPoints: number }).basisPoints).toBe(450);
    expect((entry?.after as { effectiveFrom: string }).effectiveFrom).toBe(iso(when));
  });

  it("rejects bad rates, past dates and unauthorized users", async () => {
    await seedRates();
    expect(await scheduleCommissionRate(admin, "REGULAR", 5001)).toEqual({ ok: false, error: "INVALID_RATE" });
    expect(await scheduleCommissionRate(admin, "REGULAR", -1)).toEqual({ ok: false, error: "INVALID_RATE" });
    expect(await scheduleCommissionRate(admin, "REGULAR", 7.5)).toEqual({ ok: false, error: "INVALID_RATE" });
    expect(await scheduleCommissionRate(admin, "REGULAR", 700, iso(inDays(-1)))).toEqual({ ok: false, error: "IN_PAST" });
    await expect(scheduleCommissionRate(viewer, "REGULAR", 700)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(scheduleCommissionRate(customer, "REGULAR", 700)).rejects.toBeInstanceOf(AuthorizationError);
    expect(await db.commissionRate.count()).toBe(2); // only the seeded rows
  });

  it("lets a later row at the same start date correct a scheduled rate", async () => {
    await seedRates();
    const when = inDays(10);
    await scheduleCommissionRate(admin, "REGULAR", 700, iso(when));
    await scheduleCommissionRate(admin, "REGULAR", 650, iso(when));
    expect((await buildCommissionSnapshot("REGULAR", 10_000, new Date(when.getTime() + 1000))).commissionBp).toBe(650);
  });
});

describe("payment methods", () => {
  beforeEach(async () => {
    await db.paymentMethodConfig.createMany({
      data: [
        { code: "vodafone_cash", nameAr: "فودافون كاش", sortOrder: 1, isEnabled: false },
        { code: "instapay", nameAr: "إنستاباي", sortOrder: 2, isEnabled: false },
      ],
    });
  });

  it("only enabled methods are offered, and a disabled one is rejected server-side", async () => {
    await setPaymentReceiver(admin, "vodafone_cash", "01012345678");
    await setPaymentReceiver(admin, "instapay", "01099999999");
    await setPaymentMethodEnabled(admin, "vodafone_cash", true);
    expect((await getEnabledPaymentMethods()).map((m) => m.code)).toEqual(["vodafone_cash"]);
    await expect(assertPaymentMethodEnabled("instapay")).rejects.toBeInstanceOf(PaymentMethodDisabledError);
    await expect(assertPaymentMethodEnabled("made_up")).rejects.toBeInstanceOf(PaymentMethodDisabledError);
    await setPaymentMethodEnabled(admin, "vodafone_cash", false);
    await expect(assertPaymentMethodEnabled("vodafone_cash")).rejects.toBeInstanceOf(PaymentMethodDisabledError);
  });

  it("an enabled method without a receiving number is unavailable, with its own reason; numbers are validated, audited and permission-gated", async () => {
    await setPaymentMethodEnabled(admin, "instapay", true);
    expect(await getEnabledPaymentMethods()).toEqual([]);
    await expect(assertPaymentMethodEnabled("instapay")).rejects.toMatchObject({ reason: "NO_RECEIVER" });
    for (const bad of ["abc", "123", "0101 234 5678 99999999999999"]) expect(await setPaymentReceiver(admin, "instapay", bad)).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect((await setPaymentReceiver(admin, "instapay", "010 1234-5678")).ok).toBe(true);
    expect((await getEnabledPaymentMethods()).map((m) => m.receiverNumber)).toEqual(["01012345678"]);
    await expect(setPaymentReceiver(viewer, "instapay", "01000000000")).rejects.toBeInstanceOf(AuthorizationError);
    expect((await setPaymentReceiver(admin, "instapay", null)).ok).toBe(true);
    await expect(assertPaymentMethodEnabled("instapay")).rejects.toMatchObject({ reason: "NO_RECEIVER" });
    expect((await auditFor("PAYMENT_RECEIVER_CHANGED")).length).toBe(2);
    await expect(db.$executeRawUnsafe(`UPDATE "PaymentMethodConfig" SET "receiverNumber" = 'abc' WHERE code = 'instapay'`)).rejects.toThrow();
  });

  it("audits real changes only, and denies unauthorized users", async () => {
    await setPaymentReceiver(admin, "instapay", "01099999999");
    await setPaymentMethodEnabled(admin, "instapay", true);
    await setPaymentMethodEnabled(admin, "instapay", true); // no-op
    expect((await auditFor("PAYMENT_METHOD_TOGGLED")).length).toBe(1);
    await expect(setPaymentMethodEnabled(viewer, "instapay", false)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(setPaymentMethodEnabled(customer, "instapay", false)).rejects.toBeInstanceOf(AuthorizationError);
    expect((await getEnabledPaymentMethods()).map((m) => m.code)).toEqual(["instapay"]);
  });
});

describe("delivery zones and fees", () => {
  it("creates a zone, resolves its fee, and keeps old quotes stable when the fee changes", async () => {
    expect((await createZone(admin, "وسط البلد", 3_000)).ok).toBe(true);
    const zone = await db.deliveryZone.findFirstOrThrow();
    const quoteBefore = await resolveZoneFee(zone.id);
    expect(quoteBefore.feeCents).toBe(3_000);

    const when = inDays(5);
    expect((await scheduleZoneFee(admin, zone.id, 5_000, iso(when))).ok).toBe(true);
    expect((await resolveZoneFee(zone.id)).feeCents).toBe(3_000);
    expect((await resolveZoneFee(zone.id, new Date(when.getTime() + 1000))).feeCents).toBe(5_000);
    expect(quoteBefore.feeCents).toBe(3_000); // a quote copied into an order is just a number: it cannot change
  });

  it("refuses unavailable zones and invalid input", async () => {
    await createZone(admin, "المعادي", 2_500);
    const zone = await db.deliveryZone.findFirstOrThrow();
    await setZoneActive(admin, zone.id, false);
    await expect(resolveZoneFee(zone.id)).rejects.toBeInstanceOf(ZoneUnavailableError);
    await expect(resolveZoneFee("missing")).rejects.toBeInstanceOf(ZoneUnavailableError);

    expect(await createZone(admin, "x", 1_000)).toEqual({ ok: false, error: "INVALID_NAME" });
    for (const fee of [-1, 100_001, 1.5]) expect(await createZone(admin, "منطقة", fee)).toEqual({ ok: false, error: "INVALID_FEE" });
    expect(await scheduleZoneFee(admin, zone.id, 3_000, iso(inDays(-1)))).toEqual({ ok: false, error: "IN_PAST" });
    expect(await db.deliveryZone.count()).toBe(1);
  });

  it("audits changes and denies unauthorized users", async () => {
    await expect(createZone(viewer, "منطقة", 1_000)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(createZone(customer, "منطقة", 1_000)).rejects.toBeInstanceOf(AuthorizationError);
    await createZone(admin, "الزمالك", 4_000);
    const zone = await db.deliveryZone.findFirstOrThrow();
    await scheduleZoneFee(admin, zone.id, 4_500, iso(inDays(2)));
    await setZoneActive(admin, zone.id, false);
    expect((await auditFor("DELIVERY_ZONE_CREATED")).length).toBe(1);
    expect((await auditFor("DELIVERY_FEE_SCHEDULED")).length).toBe(1);
    expect((await auditFor("DELIVERY_ZONE_ACTIVE_CHANGED")).length).toBe(1);
  });
});

describe("history is append-only at the database level (needs prisma/manual SQL applied)", () => {
  const applied = process.env.DB_TRIGGERS_APPLIED === "1";

  it.skipIf(!applied)("rejects editing or deleting audit, setting-version and commission rows", async () => {
    await seedRates();
    await changeSetting(admin, "refunds.deadline_hours", "12");
    await expect(db.auditLog.updateMany({ data: { action: "tampered" } })).rejects.toThrow();
    await expect(db.auditLog.deleteMany({})).rejects.toThrow();
    await expect(db.platformSettingVersion.deleteMany({})).rejects.toThrow();
    await expect(db.commissionRate.updateMany({ data: { basisPoints: 1 } })).rejects.toThrow();
    await expect(db.commissionRate.deleteMany({})).rejects.toThrow();
  });
});
