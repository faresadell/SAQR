import "server-only";
import type { MerchantTier, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { COMMISSION_MAX_BASIS_POINTS, computeCommission, type CommissionSnapshot } from "@/lib/commission";
import { parseEffectiveFrom, pickEffective } from "@/lib/effective";
import { AuthorizationError } from "@/server/errors";

export class CommissionNotConfiguredError extends Error {
  constructor(tier: MerchantTier) {
    super(`No commission rate is configured for tier ${tier}. Run the seed or set one in the dashboard.`);
    this.name = "CommissionNotConfiguredError";
  }
}

type Client = Prisma.TransactionClient | typeof db;

/** Rate in force at `at`. Fails closed: with no configured rate it throws instead of guessing. */
export async function resolveCommissionRate(tier: MerchantTier, at: Date = new Date(), client: Client = db) {
  const rows = await client.commissionRate.findMany({
    where: { tier, effectiveFrom: { lte: at } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  const row = pickEffective(rows, at);
  if (!row) throw new CommissionNotConfiguredError(tier);
  return { rateId: row.id, basisPoints: row.basisPoints, effectiveFrom: row.effectiveFrom };
}

export interface OrderCommissionSnapshot extends CommissionSnapshot {
  merchantTierSnap: MerchantTier;
  rateId: string;
}

/**
 * Values an order must store in its financial record when it is created (used by the order flow in phase 6).
 * The rate is the one in force at that moment and is COPIED into the order, so later rate changes
 * never affect it. `baseCents` is decided by the caller (product value, never the delivery fee).
 */
export async function buildCommissionSnapshot(
  tier: MerchantTier,
  baseCents: number,
  at: Date = new Date(),
  client: Client = db,
): Promise<OrderCommissionSnapshot> {
  const rate = await resolveCommissionRate(tier, at, client);
  return { merchantTierSnap: tier, rateId: rate.rateId, ...computeCommission(baseCents, rate.basisPoints) };
}

export type ScheduleRateResult =
  | { ok: true; effectiveFrom: Date }
  | { ok: false; error: "INVALID_RATE" | "INVALID_DATE" | "IN_PAST" | "TOO_FAR" };

/** Add a new rate for a tier. Never edits history; records old value, new value, actor and effective date. */
export async function scheduleCommissionRate(
  actor: Actor,
  tier: MerchantTier,
  basisPoints: number,
  effectiveFromRaw?: string | null,
): Promise<ScheduleRateResult> {
  if (!hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > COMMISSION_MAX_BASIS_POINTS) {
    return { ok: false, error: "INVALID_RATE" };
  }
  const now = new Date();
  const when = parseEffectiveFrom(effectiveFromRaw, now);
  if (!when.ok) return when;

  await db.$transaction(async (tx) => {
    const current = await resolveCommissionRate(tier, now, tx).catch(() => null);
    await tx.commissionRate.create({ data: { tier, basisPoints, effectiveFrom: when.date, createdById: actor.id } });
    await writeAudit(
      {
        actorId: actor.id,
        action: "COMMISSION_RATE_SCHEDULED",
        entityType: "CommissionRate",
        entityId: tier,
        before: { basisPoints: current?.basisPoints ?? null },
        after: { basisPoints, effectiveFrom: when.date.toISOString() },
      },
      tx,
    );
  });
  return { ok: true, effectiveFrom: when.date };
}

export interface RateHistoryRow {
  id: string;
  tier: MerchantTier;
  basisPoints: number;
  effectiveFrom: Date;
  createdAt: Date;
  createdByName: string | null;
}

export async function listCommissionHistory(actor: Actor): Promise<RateHistoryRow[]> {
  if (!hasPermission(actor, "settings.view") && !hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  const rows = await db.commissionRate.findMany({ orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }], take: 100 });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    tier: r.tier,
    basisPoints: r.basisPoints,
    effectiveFrom: r.effectiveFrom,
    createdAt: r.createdAt,
    createdByName: names.get(r.createdById) ?? null,
  }));
}
