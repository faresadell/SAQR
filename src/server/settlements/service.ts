import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { cairoMonthBounds, cairoMonthKey } from "@/lib/stars/rules";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { adjustmentFor, MONTH_KEY_PATTERN, retainedBase, retainedCommission, totalsOf, type SettlementLineDraft, type SettledOrder } from "@/lib/settlements/calc";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";

export type SettlementError = "INVALID_REQUEST" | "MONTH_NOT_CLOSED" | "WRONG_STATE" | "CONFLICT";
export type SettlementResult<T = object> = ({ ok: true } & T) | { ok: false; error: SettlementError };

export interface GenerateSummary {
  monthKey: string;
  created: number;
  skippedExisting: number;
  orders: number;
  adjustments: number;
}

const toSettled = (o: { commissionBaseCents: number; commissionBp: number; totalCents: number }, refundedCents: number): SettledOrder => ({
  commissionBaseCents: o.commissionBaseCents,
  commissionBp: o.commissionBp,
  totalCents: o.totalCents,
  refundedCents,
});

async function completedRefunds(tx: Prisma.TransactionClient, orderIds: string[]): Promise<Map<string, number>> {
  const rows = orderIds.length ? await tx.refund.groupBy({ by: ["orderId"], where: { orderId: { in: orderIds }, status: "COMPLETED" }, _sum: { amountCents: true } }) : [];
  return new Map(rows.map((r) => [r.orderId, r._sum.amountCents ?? 0]));
}

/**
 * Builds the statements for one CLOSED Cairo month (idempotent). Rules:
 *  - only suborders that reached DELIVERED during the month are charged; cancelled / rejected / fully refunded ones owe nothing;
 *  - each order is charged once ever (unique line key), at the rate copied into the order when it was created;
 *  - a refund completed after an earlier statement produces a negative ADJUSTMENT line in the next statement;
 *  - one statement per shop per month (unique key). Existing ones are never rewritten.
 * Without `actor` it is the scheduled job; with an actor it needs settlements.manage.
 */
export async function generateSettlements(monthKey: string, actor: Actor | null, now = new Date()): Promise<SettlementResult<{ summary: GenerateSummary }>> {
  if (actor && !hasPermission(actor, "settlements.manage")) throw new AuthorizationError();
  if (!MONTH_KEY_PATTERN.test(monthKey)) return { ok: false, error: "INVALID_REQUEST" };
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  const probe = new Date(Date.UTC(y, m - 1, 15, 12));
  const { start, end } = cairoMonthBounds(probe);
  if (cairoMonthKey(start) !== monthKey) return { ok: false, error: "INVALID_REQUEST" };
  if (end.getTime() > now.getTime()) return { ok: false, error: "MONTH_NOT_CLOSED" };

  const delivered = await db.$queryRaw<{ orderId: string }[]>`
    SELECT DISTINCT o."id" AS "orderId"
    FROM "OrderEvent" e JOIN "Order" o ON o."id" = e."orderId"
    WHERE e."field" = 'orderStatus' AND e."toValue" = 'DELIVERED' AND e."createdAt" >= ${start} AND e."createdAt" < ${end}
      AND NOT EXISTS (SELECT 1 FROM "CommissionSettlementLine" l WHERE l."orderId" = o."id" AND l."kind" = 'ORDER')`;
  const orders = delivered.length ? await db.order.findMany({ where: { id: { in: delivered.map((d) => d.orderId) } }, select: { id: true, merchantId: true, commissionBaseCents: true, commissionBp: true, totalCents: true } }) : [];

  // Earlier ORDER lines whose order has since got a COMPLETED refund and has no adjustment yet: give the difference back, once.
  const charged = await db.$queryRaw<{ orderId: string; commissionCents: number; merchantId: string }[]>`
    SELECT l."orderId", l."commissionCents", s."merchantId"
    FROM "CommissionSettlementLine" l JOIN "CommissionSettlement" s ON s."id" = l."settlementId"
    WHERE l."kind" = 'ORDER' AND s."periodEnd" <= ${start}
      AND EXISTS (SELECT 1 FROM "Refund" r WHERE r."orderId" = l."orderId" AND r."status" = 'COMPLETED')
      AND NOT EXISTS (SELECT 1 FROM "CommissionSettlementLine" a WHERE a."orderId" = l."orderId" AND a."kind" = 'ADJUSTMENT')`;

  const merchants = new Set<string>([...orders.map((o) => o.merchantId), ...charged.map((c) => c.merchantId)]);
  const summary: GenerateSummary = { monthKey, created: 0, skippedExisting: 0, orders: 0, adjustments: 0 };

  for (const merchantId of merchants) {
    try {
      await db.$transaction(async (tx) => {
        if (await tx.commissionSettlement.findUnique({ where: { merchantId_monthKey: { merchantId, monthKey } } })) {
          summary.skippedExisting += 1;
          return;
        }
        const own = orders.filter((o) => o.merchantId === merchantId);
        const refunds = await completedRefunds(tx, [...own.map((o) => o.id), ...charged.filter((c) => c.merchantId === merchantId).map((c) => c.orderId)]);
        const lines: SettlementLineDraft[] = own.map((o) => {
          const settled = toSettled(o, refunds.get(o.id) ?? 0);
          return { orderId: o.id, kind: "ORDER", baseCents: retainedBase(settled), commissionBp: o.commissionBp, commissionCents: retainedCommission(settled) };
        });
        const adjustable = charged.filter((c) => c.merchantId === merchantId);
        if (adjustable.length) {
          const full = await tx.order.findMany({ where: { id: { in: adjustable.map((c) => c.orderId) } }, select: { id: true, commissionBaseCents: true, commissionBp: true, totalCents: true } });
          for (const c of adjustable) {
            const o = full.find((f) => f.id === c.orderId);
            if (!o) continue;
            const delta = adjustmentFor(c.commissionCents, toSettled(o, refunds.get(o.id) ?? 0));
            if (delta < 0) lines.push({ orderId: o.id, kind: "ADJUSTMENT", baseCents: 0, commissionBp: o.commissionBp, commissionCents: delta });
          }
        }
        if (lines.length === 0) return;
        const totals = totalsOf(lines);
        const settlement = await tx.commissionSettlement.create({
          data: { merchantId, monthKey, periodStart: start, periodEnd: end, ...totals, issuedById: actor?.id ?? null },
        });
        await tx.commissionSettlementLine.createMany({ data: lines.map((l) => ({ settlementId: settlement.id, ...l })) });
        const shop = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { ownerId: true } });
        await notifyInTx(tx, { userId: shop.ownerId, type: "SETTLEMENT_ISSUED", title: "كشف عمولة شهري", body: `صدر كشف عمولة شهر ${monthKey}. المستحق: ${(totals.netDueCents / 100).toFixed(2)} جنيه.`, data: { settlementId: settlement.id }, dedupeKey: `settlement-issued:${settlement.id}` });
        await writeAudit({ actorId: actor?.id ?? null, action: "SETTLEMENT_ISSUED", entityType: "CommissionSettlement", entityId: settlement.id, after: { merchantId, monthKey, ...totals } }, tx);
        summary.created += 1;
        summary.orders += totals.orderCount;
        summary.adjustments += lines.filter((l) => l.kind === "ADJUSTMENT").length;
      });
    } catch (error) {
      // A concurrent run created the same statement first (unique keys): that is fine, nothing was written twice.
      if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
        summary.skippedExisting += 1;
        continue;
      }
      throw error;
    }
  }
  return { ok: true, summary };
}

/** Previous Cairo month relative to `now` (what the scheduler generates). */
export function previousMonthKey(now = new Date()): string {
  const { start } = cairoMonthBounds(now);
  return cairoMonthKey(new Date(start.getTime() - 3_600_000));
}

/**
 * An admin with settlements.manage records that the commission was received, once.
 * The platform does not collect money itself: this is an authorized person's documented confirmation.
 */
export async function markSettlementPaid(actor: Actor, settlementId: string, paymentReference: string): Promise<SettlementResult<object>> {
  if (!hasPermission(actor, "settlements.manage")) throw new AuthorizationError();
  const ref = typeof paymentReference === "string" ? paymentReference.trim() : "";
  if (ref.length < 3 || ref.length > 64) return { ok: false, error: "INVALID_REQUEST" };
  try {
    await db.$transaction(async (tx) => {
      const s = await tx.commissionSettlement.findUnique({ where: { id: settlementId }, include: { merchant: { select: { ownerId: true } } } });
      if (!s) throw new NotFoundError();
      if (s.status !== "ISSUED") throw new StateError("WRONG_STATE");
      const done = await tx.commissionSettlement.updateMany({ where: { id: s.id, status: "ISSUED" }, data: { status: "PAID", paidAt: new Date(), paidById: actor.id, paymentReference: ref } });
      if (done.count !== 1) throw new StateError("CONFLICT");
      await notifyInTx(tx, { userId: s.merchant.ownerId, type: "SETTLEMENT_PAID", title: "تم تسجيل سداد العمولة", body: `سُجّل سداد كشف عمولة شهر ${s.monthKey}.`, data: { settlementId: s.id }, dedupeKey: `settlement-paid:${s.id}` });
      await writeAudit({ actorId: actor.id, action: "SETTLEMENT_PAID", entityType: "CommissionSettlement", entityId: s.id, after: { paymentReference: ref, netDueCents: s.netDueCents } }, tx);
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof StateError) return { ok: false, error: error.code };
    throw error;
  }
}

class StateError extends Error {
  constructor(readonly code: "WRONG_STATE" | "CONFLICT") {
    super(code);
  }
}

const settlementSelect = {
  id: true,
  merchantId: true,
  monthKey: true,
  orderCount: true,
  baseCents: true,
  commissionCents: true,
  adjustmentCents: true,
  netDueCents: true,
  status: true,
  issuedAt: true,
  paidAt: true,
  paymentReference: true,
} satisfies Prisma.CommissionSettlementSelect;

function visibility(actor: Actor): Prisma.CommissionSettlementWhereInput {
  if (actor.role === "MERCHANT") return { merchant: { ownerId: actor.id } };
  if (hasPermission(actor, "settlements.manage")) return {};
  return { id: "__none__" };
}

export async function listSettlements(actor: Actor, opts: { monthKey?: string; status?: "ISSUED" | "PAID" } = {}) {
  return db.commissionSettlement.findMany({ where: { ...visibility(actor), ...(opts.monthKey ? { monthKey: opts.monthKey } : {}), ...(opts.status ? { status: opts.status } : {}) }, select: settlementSelect, orderBy: [{ monthKey: "desc" }, { id: "desc" }], take: 200 });
}

export async function getSettlement(actor: Actor, id: string) {
  const row = await db.commissionSettlement.findFirst({
    where: { id, ...visibility(actor) },
    select: { ...settlementSelect, lines: { select: { orderId: true, kind: true, baseCents: true, commissionBp: true, commissionCents: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!row) throw new NotFoundError();
  return row;
}
