/**
 * Commission settlement integration tests (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { generateSettlements, getSettlement, listSettlements, markSettlementPaid, previousMonthKey } from "@/server/settlements/service";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const admin: Actor = { id: "admin-1", role: "ADMIN", isSuperAdmin: true, permissions: [] };
const supportOnly: Actor = { id: "admin-2", role: "ADMIN", isSuperAdmin: false, permissions: ["users.view"] };
const NOW = new Date("2026-10-05T10:00:00Z"); // September 2026 is closed, October is not
const SEPT = new Date("2026-09-15T10:00:00Z");
const OCT = new Date("2026-10-02T10:00:00Z");
let n = 0;

interface Shop {
  actor: Actor;
  merchantId: string;
}
let customerId = "";

async function shop(): Promise<Shop> {
  n += 1;
  const u = await db.user.create({ data: { phone: `+2014${String(n).padStart(8, "0")}`, name: `S${n}`, passwordHash: "x", role: "MERCHANT", status: "ACTIVE" } });
  const m = await db.merchant.create({ data: { ownerId: u.id, name: `shop ${n}`, businessType: "restaurant", status: "APPROVED" } });
  return { actor: { id: u.id, role: "MERCHANT", isSuperAdmin: false, permissions: [] }, merchantId: m.id };
}

/** A suborder that was delivered at `deliveredAt` (null = never delivered), with the rate copied into it at creation. */
async function order(s: Shop, opts: { base: number; bp: number; deliveredAt: Date | null; fee?: number }) {
  const fee = opts.fee ?? 2000;
  const o = await db.order.create({
    data: {
      customerId,
      merchantId: s.merchantId,
      subtotalCents: opts.base,
      deliveryFeeCents: fee,
      totalCents: opts.base + fee,
      merchantTierSnap: opts.bp === 500 ? "BUSINESS" : "REGULAR",
      commissionBp: opts.bp,
      commissionBaseCents: opts.base,
      commissionCents: Math.floor((opts.base * opts.bp + 5000) / 10000),
      deliveryRuleSnap: {},
      addressSnap: {},
    },
  });
  if (opts.deliveredAt) await db.orderEvent.create({ data: { orderId: o.id, field: "orderStatus", toValue: "DELIVERED", createdAt: opts.deliveredAt } });
  return o;
}

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "CommissionSettlementLine","CommissionSettlement","Refund","OrderEvent","Order","Notification","AuditLog","Merchant","BusinessType","User" RESTART IDENTITY CASCADE');
  await db.businessType.create({ data: { code: "restaurant", nameAr: "مطعم" } });
  customerId = (await db.user.create({ data: { phone: "+201499999999", name: "c", passwordHash: "x", role: "CUSTOMER", status: "ACTIVE" } })).id;
});

describe("generateSettlements", () => {
  it("charges only delivered suborders of the month, at the rate stored in each order, with exact totals", async () => {
    const a = await shop();
    const b = await shop();
    await order(a, { base: 10_000, bp: 800, deliveredAt: SEPT });
    await order(a, { base: 5_000, bp: 800, deliveredAt: SEPT });
    await order(a, { base: 99_000, bp: 800, deliveredAt: null }); // cancelled / never delivered
    await order(a, { base: 77_000, bp: 800, deliveredAt: OCT }); // another month
    await order(b, { base: 20_000, bp: 500, deliveredAt: SEPT }); // Premium rate stored in the order
    const r = await generateSettlements("2026-09", admin, NOW);
    expect(r.ok && r.summary).toMatchObject({ created: 2, orders: 3 });
    const sa = await db.commissionSettlement.findUniqueOrThrow({ where: { merchantId_monthKey: { merchantId: a.merchantId, monthKey: "2026-09" } } });
    expect(sa).toMatchObject({ orderCount: 2, baseCents: 15_000, commissionCents: 1_200, adjustmentCents: 0, netDueCents: 1_200, status: "ISSUED" });
    const sb = await db.commissionSettlement.findUniqueOrThrow({ where: { merchantId_monthKey: { merchantId: b.merchantId, monthKey: "2026-09" } } });
    expect(sb.netDueCents).toBe(1_000);
    expect(await db.notification.count({ where: { userId: a.actor.id, type: "SETTLEMENT_ISSUED" } })).toBe(1);
  });

  it("a fully refunded delivered order owes nothing; a partly refunded one is charged on what was kept", async () => {
    const a = await shop();
    const full = await order(a, { base: 10_000, bp: 800, deliveredAt: SEPT });
    const part = await order(a, { base: 10_000, bp: 800, deliveredAt: SEPT });
    await db.refund.create({ data: { orderId: full.id, amountCents: 12_000, status: "COMPLETED", dueAt: SEPT } });
    await db.refund.create({ data: { orderId: part.id, amountCents: 2_500, status: "COMPLETED", dueAt: SEPT } });
    await generateSettlements("2026-09", admin, NOW);
    const s = await db.commissionSettlement.findFirstOrThrow({ where: { merchantId: a.merchantId } });
    expect(s.commissionCents).toBe(600); // 0 + 8% of 7,500
    expect(s.orderCount).toBe(2);
  });

  it("is idempotent, also under concurrent runs: one statement per shop per month, each order charged once", async () => {
    const a = await shop();
    await order(a, { base: 10_000, bp: 800, deliveredAt: SEPT });
    await Promise.all([generateSettlements("2026-09", admin, NOW), generateSettlements("2026-09", null, NOW)]);
    const again = await generateSettlements("2026-09", admin, NOW);
    expect(again.ok && again.summary.created).toBe(0);
    expect(await db.commissionSettlement.count()).toBe(1);
    expect(await db.commissionSettlementLine.count()).toBe(1);
  });

  it("refuses an open month, bad input and unauthorized callers", async () => {
    expect(await generateSettlements("2026-10", admin, NOW)).toEqual({ ok: false, error: "MONTH_NOT_CLOSED" });
    expect(await generateSettlements("2026-13", admin, NOW)).toEqual({ ok: false, error: "INVALID_REQUEST" });
    await expect(generateSettlements("2026-09", supportOnly, NOW)).rejects.toBeInstanceOf(AuthorizationError);
    expect(previousMonthKey(NOW)).toBe("2026-09");
  });

  it("gives commission back, once, when a refund completes after the statement was issued", async () => {
    const a = await shop();
    const o = await order(a, { base: 10_000, bp: 800, deliveredAt: SEPT });
    await generateSettlements("2026-09", admin, NOW);
    await db.refund.create({ data: { orderId: o.id, amountCents: 12_000, status: "COMPLETED", dueAt: SEPT } });
    const NOV = new Date("2026-11-05T10:00:00Z");
    const r = await generateSettlements("2026-10", admin, NOV);
    expect(r.ok && r.summary.adjustments).toBe(1);
    const oct = await db.commissionSettlement.findUniqueOrThrow({ where: { merchantId_monthKey: { merchantId: a.merchantId, monthKey: "2026-10" } } });
    expect(oct).toMatchObject({ orderCount: 0, commissionCents: 0, adjustmentCents: -800, netDueCents: -800 });
    const sept = await db.commissionSettlement.findUniqueOrThrow({ where: { merchantId_monthKey: { merchantId: a.merchantId, monthKey: "2026-09" } } });
    expect(sept.netDueCents).toBe(800); // the issued statement was never rewritten
    await generateSettlements("2026-11", admin, new Date("2026-12-05T10:00:00Z"));
    expect(await db.commissionSettlementLine.count({ where: { kind: "ADJUSTMENT" } })).toBe(1);
  });
});

describe("statement protection", () => {
  it("cannot be edited or deleted at the database level, even with raw SQL", async () => {
    const a = await shop();
    await order(a, { base: 10_000, bp: 800, deliveredAt: SEPT });
    await generateSettlements("2026-09", admin, NOW);
    const s = await db.commissionSettlement.findFirstOrThrow();
    await expect(db.$executeRawUnsafe(`UPDATE "CommissionSettlement" SET "netDueCents" = 1 WHERE "id" = '${s.id}'`)).rejects.toThrow();
    await expect(db.$executeRawUnsafe(`DELETE FROM "CommissionSettlement" WHERE "id" = '${s.id}'`)).rejects.toThrow();
    await expect(db.$executeRawUnsafe(`UPDATE "CommissionSettlementLine" SET "commissionCents" = 1 WHERE "settlementId" = '${s.id}'`)).rejects.toThrow();
    await expect(db.$executeRawUnsafe(`DELETE FROM "CommissionSettlementLine" WHERE "settlementId" = '${s.id}'`)).rejects.toThrow();
    expect((await db.commissionSettlement.findUniqueOrThrow({ where: { id: s.id } })).netDueCents).toBe(800);
  });

  it("is marked paid once with a reference, by an authorized admin only, and then frozen", async () => {
    const a = await shop();
    await order(a, { base: 10_000, bp: 800, deliveredAt: SEPT });
    await generateSettlements("2026-09", admin, NOW);
    const s = await db.commissionSettlement.findFirstOrThrow();
    await expect(markSettlementPaid(supportOnly, s.id, "TRX-1234")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(markSettlementPaid(a.actor, s.id, "TRX-1234")).rejects.toBeInstanceOf(AuthorizationError);
    expect(await markSettlementPaid(admin, s.id, "x")).toEqual({ ok: false, error: "INVALID_REQUEST" });
    const results = await Promise.all([markSettlementPaid(admin, s.id, "TRX-1234"), markSettlementPaid(admin, s.id, "TRX-1234")]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(await markSettlementPaid(admin, s.id, "TRX-9999")).toEqual({ ok: false, error: "WRONG_STATE" });
    await expect(db.$executeRawUnsafe(`UPDATE "CommissionSettlement" SET "status" = 'ISSUED', "paidAt" = NULL, "paymentReference" = NULL WHERE "id" = '${s.id}'`)).rejects.toThrow();
    expect(await db.auditLog.count({ where: { action: "SETTLEMENT_PAID" } })).toBe(1);
  });

  it("each shop sees only its own statements; unrelated users see none", async () => {
    const a = await shop();
    const b = await shop();
    await order(a, { base: 10_000, bp: 800, deliveredAt: SEPT });
    await order(b, { base: 10_000, bp: 800, deliveredAt: SEPT });
    await generateSettlements("2026-09", admin, NOW);
    const mine = await listSettlements(a.actor);
    expect(mine.length).toBe(1);
    expect(mine[0]?.merchantId).toBe(a.merchantId);
    const theirs = (await listSettlements(b.actor))[0]!;
    await expect(getSettlement(a.actor, theirs.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getSettlement(a.actor, mine[0]!.id)).lines.length).toBe(1);
    expect((await listSettlements(admin)).length).toBe(2);
    expect((await listSettlements(supportOnly)).length).toBe(0);
  });
});
