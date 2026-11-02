/**
 * Offers and monthly-contest integration tests (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { invalidateSettingsCache } from "@/lib/settings";
import { approveAward, listAwards, listMyAwards, markAwardPaid, proposeAward, rejectAward } from "@/server/contest/service";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { createOffer, extendOffer, listOffersForAdmin, listMyOffers, listPublicOffers, stopOffer, updateOffer } from "@/server/offers/service";
import { applyStarMove, getStarBalance } from "@/server/stars/ledger";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const admin: Actor = { id: "admin-1", role: "ADMIN", isSuperAdmin: true, permissions: [] };
const supportOnly: Actor = { id: "admin-2", role: "ADMIN", isSuperAdmin: false, permissions: ["users.view"] };
const NOW = new Date("2026-10-05T10:00:00Z"); // September 2026 is closed, October is open
let n = 0;
let keyNo = 0;
const key = () => `extend-key-${(keyNo += 1)}-abcdef`;
const past = new Date(Date.now() - 86_400_000);

async function shopOwner(status: "APPROVED" | "PENDING_REVIEW" = "APPROVED", stars = 50): Promise<{ actor: Actor; merchantId: string }> {
  n += 1;
  const u = await db.user.create({ data: { phone: `+2016${String(n).padStart(8, "0")}`, name: `M${n}`, passwordHash: "x", role: "MERCHANT", status: "ACTIVE" } });
  const m = await db.merchant.create({ data: { ownerId: u.id, name: `shop ${n}`, businessType: "restaurant", status } });
  if (stars > 0) await db.$transaction((tx) => applyStarMove(tx, { userId: u.id, amount: stars, reason: "PURCHASE", idempotencyKey: `seed:${u.id}` }));
  return { actor: { id: u.id, role: "MERCHANT", isSuperAdmin: false, permissions: [] }, merchantId: m.id };
}
async function customer(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  n += 1;
  return db.user.create({ data: { phone: `+2016${String(n).padStart(8, "0")}`, name: `C${n}`, passwordHash: "x", role: "CUSTOMER", status } });
}

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "OfferExtension","Offer","ContestAward","StarLedgerEntry","StarAccount","PlatformSettingVersion","Notification","AuditLog","Merchant","BusinessType","User" RESTART IDENTITY CASCADE');
  invalidateSettingsCache();
  await db.businessType.create({ data: { code: "restaurant", nameAr: "مطعم" } });
});

describe("offers", () => {
  it("creates an offer for the base duration (24 h) at no cost; only approved shops; text validated", async () => {
    const { actor } = await shopOwner();
    const r = await createOffer(actor, { title: "عرض الجمعة", description: "وصف" });
    if (!r.ok) throw new Error("setup");
    const o = await db.offer.findUniqueOrThrow({ where: { id: r.offerId } });
    expect(o.endsAt.getTime() - o.startsAt.getTime()).toBe(24 * 3_600_000);
    expect(await getStarBalance(db, actor.id)).toBe(50);
    expect((await shopOwner("PENDING_REVIEW")).actor).toBeTruthy();
    const pending = await shopOwner("PENDING_REVIEW");
    expect(await createOffer(pending.actor, { title: "عرض" })).toEqual({ ok: false, error: "SHOP_NOT_APPROVED" });
    expect(await createOffer(actor, { title: "ab" })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await createOffer(actor, { title: "عرض صحيح", description: "x".repeat(501) })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    await expect(createOffer({ ...actor, role: "CUSTOMER" }, { title: "عرض صحيح" })).rejects.toBeInstanceOf(AuthorizationError);
    expect((await listMyOffers(actor))[0]?.state).toBe("ACTIVE");
  });

  it("uses the admin-changeable base duration without touching existing offers", async () => {
    const { actor } = await shopOwner();
    const first = await createOffer(actor, { title: "عرض أول" });
    await db.platformSettingVersion.create({ data: { key: "offers.base_duration_hours", value: { v: 48 }, effectiveFrom: past, createdById: "t" } });
    invalidateSettingsCache();
    const second = await createOffer(actor, { title: "عرض ثان" });
    if (!first.ok || !second.ok) throw new Error("setup");
    const a = await db.offer.findUniqueOrThrow({ where: { id: first.offerId } });
    const b = await db.offer.findUniqueOrThrow({ where: { id: second.offerId } });
    expect(a.endsAt.getTime() - a.startsAt.getTime()).toBe(24 * 3_600_000);
    expect(b.endsAt.getTime() - b.startsAt.getTime()).toBe(48 * 3_600_000);
  });

  it("an extension costs one star per extra hour, once per key; retries and bad requests change nothing", async () => {
    const { actor } = await shopOwner();
    const r = await createOffer(actor, { title: "عرض" });
    if (!r.ok) throw new Error("setup");
    const k = key();
    const first = await extendOffer(actor, r.offerId, { hours: 5, idempotencyKey: k });
    expect(first.ok && first.starsCharged).toBe(5);
    expect(await getStarBalance(db, actor.id)).toBe(45);
    const again = await extendOffer(actor, r.offerId, { hours: 5, idempotencyKey: k });
    expect(again.ok && again.replayed).toBe(true);
    expect(await getStarBalance(db, actor.id)).toBe(45);
    const o = await db.offer.findUniqueOrThrow({ where: { id: r.offerId } });
    expect(o.endsAt.getTime() - o.startsAt.getTime()).toBe(29 * 3_600_000); // not a multiple of 24: any whole hours
    expect(await extendOffer(actor, r.offerId, { hours: 0, idempotencyKey: key() })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await extendOffer(actor, r.offerId, { hours: 1.5, idempotencyKey: key() })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await extendOffer(actor, r.offerId, { hours: 2, idempotencyKey: "short" })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await extendOffer(actor, r.offerId, { hours: 46, idempotencyKey: key() })).toEqual({ ok: false, error: "INSUFFICIENT_STARS" });
    expect(await getStarBalance(db, actor.id)).toBe(45);
    expect(await db.offerExtension.count()).toBe(1);
  });

  it("parallel extensions never double-charge or lose time", async () => {
    const { actor } = await shopOwner();
    const r = await createOffer(actor, { title: "عرض" });
    if (!r.ok) throw new Error("setup");
    const k = key();
    const same = await Promise.all([extendOffer(actor, r.offerId, { hours: 3, idempotencyKey: k }), extendOffer(actor, r.offerId, { hours: 3, idempotencyKey: k })]);
    expect(same.filter((x) => x.ok).length).toBeGreaterThanOrEqual(1);
    expect(await db.offerExtension.count()).toBe(1);
    expect(await getStarBalance(db, actor.id)).toBe(47);
    const many = await Promise.all([extendOffer(actor, r.offerId, { hours: 2, idempotencyKey: key() }), extendOffer(actor, r.offerId, { hours: 2, idempotencyKey: key() })]);
    const applied = many.filter((x) => x.ok).length;
    const o = await db.offer.findUniqueOrThrow({ where: { id: r.offerId } });
    expect(o.endsAt.getTime() - o.startsAt.getTime()).toBe((24 + 3 + 2 * applied) * 3_600_000);
    expect(await getStarBalance(db, actor.id)).toBe(47 - 2 * applied); // a conflicting request is rolled back, never charged
  });

  it("follows the per-hour star setting, and refuses stopped, expired and foreign offers", async () => {
    const { actor } = await shopOwner();
    const other = await shopOwner();
    const r = await createOffer(actor, { title: "عرض" });
    if (!r.ok) throw new Error("setup");
    await db.platformSettingVersion.create({ data: { key: "offers.extension_stars_per_hour", value: { v: 2 }, effectiveFrom: past, createdById: "t" } });
    invalidateSettingsCache();
    const e = await extendOffer(actor, r.offerId, { hours: 3, idempotencyKey: key() });
    expect(e.ok && e.starsCharged).toBe(6);
    await expect(extendOffer(other.actor, r.offerId, { hours: 1, idempotencyKey: key() })).rejects.toBeInstanceOf(NotFoundError);
    await db.offer.update({ where: { id: r.offerId }, data: { endsAt: new Date(Date.now() - 1000), startsAt: new Date(Date.now() - 3_600_000) } });
    expect(await extendOffer(actor, r.offerId, { hours: 1, idempotencyKey: key() })).toEqual({ ok: false, error: "OFFER_NOT_ACTIVE" });
    expect((await listMyOffers(actor))[0]?.state).toBe("EXPIRED");
    expect(await updateOffer(actor, r.offerId, { title: "جديد جدا" })).toEqual({ ok: false, error: "OFFER_NOT_ACTIVE" });
  });

  it("is stopped once by its owner or an admin (with a reason, the shop is told); text edits are validated", async () => {
    const { actor } = await shopOwner();
    const other = await shopOwner();
    const r = await createOffer(actor, { title: "عرض" });
    if (!r.ok) throw new Error("setup");
    expect((await updateOffer(actor, r.offerId, { title: "عنوان معدّل", description: null })).ok).toBe(true);
    expect(await updateOffer(actor, r.offerId, {})).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await updateOffer(actor, r.offerId, { title: "x" })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    await expect(updateOffer(other.actor, r.offerId, { title: "اختراق العرض" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(stopOffer(other.actor, r.offerId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(stopOffer(supportOnly, r.offerId, "سبب كافي")).rejects.toBeInstanceOf(NotFoundError);
    expect(await stopOffer(admin, r.offerId)).toEqual({ ok: false, error: "INVALID_REQUEST" });
    const both = await Promise.all([stopOffer(actor, r.offerId), stopOffer(admin, r.offerId, "مخالف للسياسة")]);
    expect(both.filter((x) => x.ok).length).toBe(1);
    expect(await stopOffer(actor, r.offerId)).toEqual({ ok: false, error: "WRONG_STATE" });
    expect((await listMyOffers(actor))[0]?.state).toBe("STOPPED");
    expect(await extendOffer(actor, r.offerId, { hours: 1, idempotencyKey: key() })).toEqual({ ok: false, error: "OFFER_NOT_ACTIVE" });
    expect(await db.auditLog.count({ where: { entityId: r.offerId, action: "OFFER_STOPPED" } })).toBe(1);
  });

  it("the public list shows only running offers of approved shops; the admin list needs offers.manage", async () => {
    const a = await shopOwner();
    const b = await shopOwner();
    const pending = await shopOwner("PENDING_REVIEW");
    const ra = await createOffer(a.actor, { title: "عرض ظاهر" });
    const rb = await createOffer(b.actor, { title: "عرض موقوف" });
    if (!ra.ok || !rb.ok) throw new Error("setup");
    await stopOffer(b.actor, rb.offerId);
    await db.offer.create({ data: { merchantId: pending.merchantId, title: "متجر غير معتمد", startsAt: new Date(), endsAt: new Date(Date.now() + 3_600_000) } });
    expect((await listPublicOffers()).map((o) => o.title)).toEqual(["عرض ظاهر"]);
    expect((await listOffersForAdmin(admin)).length).toBe(3);
    expect((await listOffersForAdmin(admin, "STOPPED")).length).toBe(1);
    await expect(listOffersForAdmin(supportOnly)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(listOffersForAdmin(a.actor)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("monthly contest", () => {
  const propose = (userId: string, rank = 1, month = "2026-09", actor = admin) => proposeAward(actor, { monthKey: month, rank, userId, basisNote: "الأعلى نشاطاً حسب تقرير الإدارة" }, NOW);

  it("proposes winners for a closed month with the prize copied from settings; one per rank and per person", async () => {
    const [a, b, c] = [await customer(), await customer(), await customer()];
    const r1 = await propose(a.id, 1);
    expect(r1.ok).toBe(true);
    expect((await db.contestAward.findFirstOrThrow({ where: { rank: 1 } })).prizeCents).toBe(100_000);
    expect(await propose(b.id, 1)).toEqual({ ok: false, error: "RANK_TAKEN" });
    expect(await propose(a.id, 2)).toEqual({ ok: false, error: "ALREADY_RANKED" });
    expect((await propose(b.id, 2)).ok).toBe(true);
    expect((await propose(c.id, 3)).ok).toBe(true);
    expect((await db.contestAward.findMany({ orderBy: { rank: "asc" } })).map((x) => x.prizeCents)).toEqual([100_000, 50_000, 25_000]);
    // changing the prize setting later does not touch an award that was already proposed
    await db.platformSettingVersion.create({ data: { key: "contest.prize_first_egp", value: { v: 2000 }, effectiveFrom: past, createdById: "t" } });
    invalidateSettingsCache();
    expect((await db.contestAward.findFirstOrThrow({ where: { rank: 1 } })).prizeCents).toBe(100_000);
  });

  it("refuses an open month, bad input, ineligible people and unauthorized callers", async () => {
    const a = await customer();
    expect(await propose(a.id, 1, "2026-10")).toEqual({ ok: false, error: "MONTH_NOT_CLOSED" });
    expect(await proposeAward(admin, { monthKey: "2026-09", rank: 1, userId: a.id, basisNote: "قصير" }, NOW)).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await propose(a.id, 4)).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await propose(a.id, 1, "2026-13")).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await propose("missing-user-id", 1)).toEqual({ ok: false, error: "USER_NOT_ELIGIBLE" });
    expect(await propose((await customer("SUSPENDED")).id, 1)).toEqual({ ok: false, error: "USER_NOT_ELIGIBLE" });
    await expect(propose(a.id, 1, "2026-09", supportOnly)).rejects.toBeInstanceOf(AuthorizationError);
    expect(await db.contestAward.count()).toBe(0);
  });

  it("approve, reject and pay each happen once, in order, with notifications and audit", async () => {
    const [a, b] = [await customer(), await customer()];
    const r1 = await propose(a.id, 1);
    const r2 = await propose(b.id, 2);
    if (!r1.ok || !r2.ok) throw new Error("setup");
    expect(await markAwardPaid(admin, r1.awardId, "CASH-001")).toEqual({ ok: false, error: "WRONG_STATE" }); // must be approved first
    await expect(approveAward(supportOnly, r1.awardId)).rejects.toBeInstanceOf(AuthorizationError);
    const both = await Promise.all([approveAward(admin, r1.awardId), approveAward(admin, r1.awardId)]);
    expect(both.filter((x) => x.ok).length).toBe(1);
    expect(await db.notification.count({ where: { userId: a.id, type: "CONTEST_WINNER" } })).toBe(1);
    expect(await markAwardPaid(admin, r1.awardId, "x")).toEqual({ ok: false, error: "INVALID_REQUEST" });
    const pay = await Promise.all([markAwardPaid(admin, r1.awardId, "CASH-001"), markAwardPaid(admin, r1.awardId, "CASH-001")]);
    expect(pay.filter((x) => x.ok).length).toBe(1);
    expect(await markAwardPaid(admin, r1.awardId, "CASH-002")).toEqual({ ok: false, error: "WRONG_STATE" });
    expect((await db.contestAward.findUniqueOrThrow({ where: { id: r1.awardId } })).paymentReference).toBe("CASH-001");

    expect(await rejectAward(admin, r2.awardId, "")).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect((await rejectAward(admin, r2.awardId, "بيانات غير صحيحة")).ok).toBe(true);
    expect(await approveAward(admin, r2.awardId)).toEqual({ ok: false, error: "WRONG_STATE" });
    expect((await propose((await customer()).id, 2)).ok).toBe(true); // a rejected rank can be proposed again
    expect((await listMyAwards({ id: a.id, role: "CUSTOMER", isSuperAdmin: false, permissions: [] })).map((x) => x.status)).toEqual(["PAID"]);
    expect((await listMyAwards({ id: b.id, role: "CUSTOMER", isSuperAdmin: false, permissions: [] })).length).toBe(0);
    expect((await listAwards(admin, "2026-09")).length).toBe(3);
    for (const action of ["CONTEST_AWARD_PROPOSED", "CONTEST_AWARD_APPROVED", "CONTEST_AWARD_PAID", "CONTEST_AWARD_REJECTED"]) expect(await db.auditLog.count({ where: { action } })).toBeGreaterThan(0);
  });

  it("awards cannot be deleted or rewritten at the database level, even with raw SQL", async () => {
    const a = await customer();
    const r = await propose(a.id, 1);
    if (!r.ok) throw new Error("setup");
    await expect(db.$executeRawUnsafe(`DELETE FROM "ContestAward" WHERE id = '${r.awardId}'`)).rejects.toThrow();
    await expect(db.$executeRawUnsafe(`UPDATE "ContestAward" SET "prizeCents" = 1 WHERE id = '${r.awardId}'`)).rejects.toThrow();
    await expect(db.$executeRawUnsafe(`UPDATE "ContestAward" SET "userId" = 'someone' WHERE id = '${r.awardId}'`)).rejects.toThrow();
    await approveAward(admin, r.awardId);
    await markAwardPaid(admin, r.awardId, "CASH-777");
    await expect(db.$executeRawUnsafe(`UPDATE "ContestAward" SET "status" = 'PROPOSED' WHERE id = '${r.awardId}'`)).rejects.toThrow();
    await expect(db.$executeRawUnsafe(`UPDATE "OfferExtension" SET "hours" = 1`)).resolves.toBeDefined(); // no rows exist: trigger fires per row
  });
});
