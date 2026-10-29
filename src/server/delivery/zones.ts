import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { parseEffectiveFrom, pickEffective } from "@/lib/effective";
import { AuthorizationError, NotFoundError } from "@/server/errors";

export const MAX_DELIVERY_FEE_CENTS = 100_000; // 1,000 EGP: typo guard
const NAME_MAX = 80;

export class ZoneUnavailableError extends Error {
  constructor() {
    super("Delivery zone is not available");
    this.name = "ZoneUnavailableError";
  }
}

type Client = Prisma.TransactionClient | typeof db;
export type ZoneResult = { ok: true } | { ok: false; error: "INVALID_NAME" | "INVALID_FEE" | "INVALID_DATE" | "IN_PAST" | "TOO_FAR" };

function validFee(feeCents: number): boolean {
  return Number.isInteger(feeCents) && feeCents >= 0 && feeCents <= MAX_DELIVERY_FEE_CENTS;
}

async function feeAt(zoneId: string, at: Date, client: Client): Promise<{ id: string; feeCents: number } | null> {
  const rows = await client.deliveryFeeVersion.findMany({
    where: { zoneId, effectiveFrom: { lte: at } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  const row = pickEffective(rows, at);
  return row ? { id: row.id, feeCents: row.feeCents } : null;
}

/**
 * The fee a customer pays in an ACTIVE zone at time `at`. The order flow copies this value (and the
 * version id) into the order snapshot, so later fee changes never touch existing orders.
 */
export async function resolveZoneFee(zoneId: string, at: Date = new Date(), client: Client = db) {
  const zone = await client.deliveryZone.findUnique({ where: { id: zoneId } });
  if (!zone || !zone.isActive) throw new ZoneUnavailableError();
  const fee = await feeAt(zoneId, at, client);
  if (!fee) throw new ZoneUnavailableError();
  return { zoneId, feeCents: fee.feeCents, feeVersionId: fee.id };
}

export async function createZone(actor: Actor, name: string, feeCents: number): Promise<ZoneResult> {
  if (!hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  const clean = name.trim();
  if (clean.length < 2 || clean.length > NAME_MAX) return { ok: false, error: "INVALID_NAME" };
  if (!validFee(feeCents)) return { ok: false, error: "INVALID_FEE" };

  await db.$transaction(async (tx) => {
    const zone = await tx.deliveryZone.create({ data: { name: clean } });
    await tx.deliveryFeeVersion.create({ data: { zoneId: zone.id, feeCents, effectiveFrom: new Date(), createdById: actor.id } });
    await writeAudit(
      { actorId: actor.id, action: "DELIVERY_ZONE_CREATED", entityType: "DeliveryZone", entityId: zone.id, after: { name: clean, feeCents } },
      tx,
    );
  });
  return { ok: true };
}

export async function scheduleZoneFee(actor: Actor, zoneId: string, feeCents: number, effectiveFromRaw?: string | null): Promise<ZoneResult> {
  if (!hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  if (!validFee(feeCents)) return { ok: false, error: "INVALID_FEE" };
  const now = new Date();
  const when = parseEffectiveFrom(effectiveFromRaw, now);
  if (!when.ok) return when;

  await db.$transaction(async (tx) => {
    const zone = await tx.deliveryZone.findUnique({ where: { id: zoneId } });
    if (!zone) throw new NotFoundError();
    const current = await feeAt(zoneId, now, tx);
    await tx.deliveryFeeVersion.create({ data: { zoneId, feeCents, effectiveFrom: when.date, createdById: actor.id } });
    await writeAudit(
      {
        actorId: actor.id,
        action: "DELIVERY_FEE_SCHEDULED",
        entityType: "DeliveryZone",
        entityId: zoneId,
        before: { feeCents: current?.feeCents ?? null },
        after: { feeCents, effectiveFrom: when.date.toISOString() },
      },
      tx,
    );
  });
  return { ok: true };
}

/** Zones are deactivated, never deleted (saved addresses and past orders refer to them). */
export async function setZoneActive(actor: Actor, zoneId: string, isActive: boolean): Promise<void> {
  if (!hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  await db.$transaction(async (tx) => {
    const zone = await tx.deliveryZone.findUnique({ where: { id: zoneId } });
    if (!zone) throw new NotFoundError();
    if (zone.isActive === isActive) return;
    await tx.deliveryZone.update({ where: { id: zoneId }, data: { isActive } });
    await writeAudit(
      {
        actorId: actor.id,
        action: "DELIVERY_ZONE_ACTIVE_CHANGED",
        entityType: "DeliveryZone",
        entityId: zoneId,
        before: { isActive: zone.isActive },
        after: { isActive },
      },
      tx,
    );
  });
}

export interface ZoneView {
  id: string;
  name: string;
  isActive: boolean;
  currentFeeCents: number | null;
  upcoming: { feeCents: number; effectiveFrom: Date } | null;
}

export async function listZones(actor: Actor): Promise<ZoneView[]> {
  if (!hasPermission(actor, "settings.view") && !hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  const now = new Date();
  const zones = await db.deliveryZone.findMany({ orderBy: { createdAt: "asc" }, include: { fees: true } });
  return zones.map((zone) => {
    const current = pickEffective(zone.fees, now);
    const future = zone.fees
      .filter((f) => f.effectiveFrom > now)
      .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime() || b.createdAt.getTime() - a.createdAt.getTime())[0];
    return {
      id: zone.id,
      name: zone.name,
      isActive: zone.isActive,
      currentFeeCents: current?.feeCents ?? null,
      upcoming: future ? { feeCents: future.feeCents, effectiveFrom: future.effectiveFrom } : null,
    };
  });
}
