/**
 * Phase 1 integration tests against a real PostgreSQL database:  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables. The database name must end in "test" or "ci" (see src/test/integration-setup.ts).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { emptyWeek, type OpeningHours } from "@/lib/catalog/opening-hours";
import { purgeExpiredAuthData } from "@/lib/maintenance/purge";
import { getSettingAt, invalidateSettingsCache } from "@/lib/settings";
import { getPublicMenu, listPublicMerchants } from "@/server/catalog/public";
import { reviewMerchant, saveOwnMerchant } from "@/server/merchants/service";
import { changeSetting, isChangeNeeded } from "@/server/settings/service";
import { setUserStatus } from "@/server/users/service";
import type { SessionUser } from "@/server/auth/session";

const admin: Actor = { id: "admin-1", role: "ADMIN", isSuperAdmin: true, permissions: [] };
const adminSession: SessionUser = {
  sessionId: "s1",
  user: { id: "admin-1", name: "Admin", phone: "+201000000001", role: "ADMIN", isSuperAdmin: true, permissions: [] },
};

const DAY = 86_400_000;
const HOUR = 3_600_000;

function alwaysOpen(): OpeningHours {
  const week = emptyWeek();
  for (const day of Object.keys(week) as (keyof OpeningHours)[]) week[day] = [{ open: "00:00", close: "24:00" }];
  return week;
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "PlatformSettingVersion","AuditLog","Category","BusinessType","CommissionRate","RateLimitHit","OtpCode","User" RESTART IDENTITY CASCADE',
  );
  invalidateSettingsCache();
  await db.businessType.create({ data: { code: "restaurant", nameAr: "مطعم" } });
});

describe("a suspended owner hides the shop from customers", () => {
  it("hides it from the public list and menu, and brings it back on reactivation", async () => {
    const owner = await db.user.create({
      data: { phone: "+201011111111", name: "Owner", passwordHash: "x", role: "MERCHANT", status: "ACTIVE", phoneVerifiedAt: new Date() },
    });
    const actor: Actor = { id: owner.id, role: "MERCHANT", isSuperAdmin: false, permissions: [] };
    expect((await saveOwnMerchant(actor, { name: "مطعم الصقر", businessType: "restaurant", description: "وجبات" }, alwaysOpen())).ok).toBe(true);
    const shop = await db.merchant.findFirstOrThrow({ where: { ownerId: owner.id } });
    expect((await reviewMerchant(admin, shop.id, "APPROVE")).ok).toBe(true);

    expect((await listPublicMerchants()).map((m) => m.id)).toEqual([shop.id]);
    expect(await getPublicMenu(shop.id)).not.toBeNull();

    await setUserStatus(adminSession, owner.id, "SUSPENDED", "fake receipts", "unknown");
    expect(await listPublicMerchants()).toEqual([]);
    expect(await getPublicMenu(shop.id)).toBeNull();
    expect((await db.merchant.findUniqueOrThrow({ where: { id: shop.id } })).status).toBe("APPROVED"); // review status untouched

    await setUserStatus(adminSession, owner.id, "ACTIVE", "appeal accepted", "unknown");
    expect((await listPublicMerchants()).map((m) => m.id)).toEqual([shop.id]);
  });
});

describe("scheduled settings can be reverted", () => {
  it("compares a new value with what will be in force on the effective date, not with today's value", async () => {
    const key = "refunds.deadline_hours"; // default 24
    const when = new Date(Date.now() + 7 * DAY);

    expect((await changeSetting(admin, key, "12", when.toISOString())).ok).toBe(true);
    expect(await getSettingAt(key, new Date())).toBe(24); // today unchanged
    expect(await getSettingAt(key, when)).toBe(12);

    expect(await isChangeNeeded(key, 12, when)).toBe(false); // already scheduled
    expect(await isChangeNeeded(key, 24, when)).toBe(true); // reverting the schedule IS a change

    expect((await changeSetting(admin, key, "24", when.toISOString())).ok).toBe(true);
    invalidateSettingsCache();
    expect(await getSettingAt(key, when)).toBe(24); // the newest entry for the same date wins
  });
});

describe("housekeeping of short-lived auth data", () => {
  it("removes old rate-limit hits, old codes and expired sessions, and nothing else", async () => {
    const now = new Date();
    const ago = (h: number) => new Date(now.getTime() - h * HOUR);
    const user = await db.user.create({ data: { phone: "+201022222222", name: "U", passwordHash: "x", role: "CUSTOMER", status: "ACTIVE" } });

    await db.rateLimitHit.createMany({ data: [{ key: "old", createdAt: ago(30) }, { key: "fresh", createdAt: ago(1) }] });
    await db.otpCode.createMany({
      data: [
        { phone: "+201000000001", purpose: "SIGNUP", codeHash: "h", expiresAt: ago(29), createdAt: ago(30) },
        { phone: "+201000000002", purpose: "SIGNUP", codeHash: "h", expiresAt: ago(0), createdAt: ago(1) },
      ],
    });
    await db.session.createMany({
      data: [
        { userId: user.id, tokenHash: "expired", expiresAt: ago(1) },
        { userId: user.id, tokenHash: "live", expiresAt: new Date(now.getTime() + HOUR) },
      ],
    });

    expect(await purgeExpiredAuthData(db, now)).toEqual({ rateLimitHits: 1, otpCodes: 1, sessions: 1 });
    expect((await db.rateLimitHit.findMany()).map((r) => r.key)).toEqual(["fresh"]);
    expect(await db.otpCode.count()).toBe(1);
    expect((await db.session.findMany()).map((s) => s.tokenHash)).toEqual(["live"]);
    expect(await db.user.count()).toBe(1);
  });
});

describe("sign-up nonce column", () => {
  it("is nullable, stored as given and clearable", async () => {
    const user = await db.user.create({ data: { phone: "+201033333333", name: "N", passwordHash: "x", role: "CUSTOMER", signupNonceHash: "a".repeat(64) } });
    expect(user.signupNonceHash).toBe("a".repeat(64));
    expect((await db.user.update({ where: { id: user.id }, data: { signupNonceHash: null } })).signupNonceHash).toBeNull();
    expect((await db.user.create({ data: { phone: "+201044444444", name: "M", passwordHash: "x", role: "CUSTOMER" } })).signupNonceHash).toBeNull();
  });
});
