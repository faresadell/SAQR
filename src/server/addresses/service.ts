import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";

export type AddressError = "INVALID_REQUEST" | "ZONE_UNAVAILABLE" | "TOO_MANY_ADDRESSES";
export type AddressResult<T = object> = ({ ok: true } & T) | { ok: false; error: AddressError };

/** Technical cap against abuse (not a business rule). */
export const MAX_ADDRESSES = 20;

export interface AddressInput {
  label?: string | null;
  line: string;
  zoneId: string;
  lat?: number | null;
  lng?: number | null;
}

const mustBeCustomer = (actor: Actor): void => {
  if (actor.role !== "CUSTOMER") throw new AuthorizationError();
};

function clean(input: Partial<AddressInput>): { ok: true; data: { label?: string | null; line?: string; lat?: number | null; lng?: number | null } } | { ok: false } {
  const data: { label?: string | null; line?: string; lat?: number | null; lng?: number | null } = {};
  if (input.line !== undefined) {
    const line = typeof input.line === "string" ? input.line.trim() : "";
    if (line.length < 5 || line.length > 200) return { ok: false };
    data.line = line;
  }
  if (input.label !== undefined) {
    if (input.label === null || input.label === "") data.label = null;
    else {
      const label = typeof input.label === "string" ? input.label.trim() : "";
      if (label.length < 1 || label.length > 40) return { ok: false };
      data.label = label;
    }
  }
  for (const [k, lo, hi] of [["lat", -90, 90], ["lng", -180, 180]] as const) {
    const v = input[k];
    if (v === undefined) continue;
    if (v === null) data[k] = null;
    else if (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi) data[k] = v;
    else return { ok: false };
  }
  return { ok: true, data };
}

const select = { id: true, label: true, line: true, lat: true, lng: true, zoneId: true, zone: { select: { name: true } } } as const;

export async function listMyAddresses(actor: Actor) {
  mustBeCustomer(actor);
  return db.address.findMany({ where: { userId: actor.id }, orderBy: { id: "asc" }, select });
}

async function usableZone(zoneId: unknown): Promise<boolean> {
  if (typeof zoneId !== "string" || zoneId.length < 1 || zoneId.length > 64) return false;
  return (await db.deliveryZone.count({ where: { id: zoneId, isActive: true } })) === 1;
}

export async function createAddress(actor: Actor, input: AddressInput): Promise<AddressResult<{ addressId: string }>> {
  mustBeCustomer(actor);
  if (!input || input.line === undefined) return { ok: false, error: "INVALID_REQUEST" };
  const parsed = clean(input);
  if (!parsed.ok) return { ok: false, error: "INVALID_REQUEST" };
  if (!(await usableZone(input.zoneId))) return { ok: false, error: "ZONE_UNAVAILABLE" };
  return db.$transaction(async (tx): Promise<AddressResult<{ addressId: string }>> => {
    if ((await tx.address.count({ where: { userId: actor.id } })) >= MAX_ADDRESSES) return { ok: false, error: "TOO_MANY_ADDRESSES" };
    const row = await tx.address.create({ data: { userId: actor.id, zoneId: input.zoneId, line: parsed.data.line!, label: parsed.data.label ?? null, lat: parsed.data.lat ?? null, lng: parsed.data.lng ?? null } });
    await writeAudit({ actorId: actor.id, action: "ADDRESS_CREATED", entityType: "Address", entityId: row.id }, tx);
    return { ok: true, addressId: row.id };
  });
}

/** Past orders keep the address they were placed with (it is copied into the order), so editing never rewrites history. */
export async function updateAddress(actor: Actor, addressId: string, input: Partial<AddressInput>): Promise<AddressResult> {
  mustBeCustomer(actor);
  const parsed = clean(input);
  if (!parsed.ok || (Object.keys(parsed.data).length === 0 && input.zoneId === undefined)) return { ok: false, error: "INVALID_REQUEST" };
  if (input.zoneId !== undefined && !(await usableZone(input.zoneId))) return { ok: false, error: "ZONE_UNAVAILABLE" };
  const changed = await db.address.updateMany({ where: { id: addressId, userId: actor.id }, data: { ...parsed.data, ...(input.zoneId !== undefined ? { zoneId: input.zoneId } : {}) } });
  if (changed.count !== 1) throw new NotFoundError(); // someone else's address looks missing
  await writeAudit({ actorId: actor.id, action: "ADDRESS_UPDATED", entityType: "Address", entityId: addressId });
  return { ok: true };
}

export async function deleteAddress(actor: Actor, addressId: string): Promise<void> {
  mustBeCustomer(actor);
  const removed = await db.address.deleteMany({ where: { id: addressId, userId: actor.id } });
  if (removed.count !== 1) throw new NotFoundError();
  await writeAudit({ actorId: actor.id, action: "ADDRESS_DELETED", entityType: "Address", entityId: addressId });
}
