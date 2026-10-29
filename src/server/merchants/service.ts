import "server-only";
import type { MerchantStatus, MerchantTier, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { canEditOwnProfile } from "@/lib/catalog/catalog-policy";
import { validateMerchantInput, type MerchantField, type MerchantInput } from "@/lib/catalog/merchant-input";
import { applyMerchantAction, type MerchantAction } from "@/lib/catalog/merchant-status";
import { validateOpeningHours, type OpeningHours } from "@/lib/catalog/opening-hours";
import { AuthorizationError, NotFoundError } from "@/server/errors";

type Client = Prisma.TransactionClient | typeof db;

export type SaveMerchantResult =
  | { ok: true; created: boolean }
  | { ok: false; error: "INVALID"; errors: Partial<Record<MerchantField | "hours" | "businessType", string>> }
  | { ok: false; error: "LOCKED" };

/** The signed-in merchant's own shop. The id always comes from the session, never from the request. */
export async function getOwnMerchant(actor: Actor) {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  return db.merchant.findUnique({ where: { ownerId: actor.id } });
}

async function assertActiveBusinessType(code: string, client: Client): Promise<boolean> {
  const type = await client.businessType.findUnique({ where: { code } });
  return Boolean(type?.isActive);
}

/**
 * Create the owner's shop (pending admin review) or update it. Editing is blocked while the shop is rejected or
 * suspended. Every update is audited with the fields that changed.
 */
export async function saveOwnMerchant(actor: Actor, raw: Parameters<typeof validateMerchantInput>[0], hoursRaw: unknown | null): Promise<SaveMerchantResult> {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const parsed = validateMerchantInput(raw);
  const errors: Partial<Record<MerchantField | "hours", string>> = parsed.ok ? {} : { ...parsed.errors };

  let hours: OpeningHours | null = null;
  if (hoursRaw !== null) {
    const h = validateOpeningHours(hoursRaw);
    if (h.ok) hours = h.value;
    else errors.hours = "ساعات العمل غير صحيحة. تأكد أن وقت الإغلاق بعد وقت الفتح.";
  }
  if (!parsed.ok || errors.hours) return { ok: false, error: "INVALID", errors };

  const input: MerchantInput = parsed.value;
  return db.$transaction(async (tx): Promise<SaveMerchantResult> => {
    if (!(await assertActiveBusinessType(input.businessType, tx))) {
      return { ok: false, error: "INVALID", errors: { businessType: "نوع النشاط غير متاح." } };
    }
    const existing = await tx.merchant.findUnique({ where: { ownerId: actor.id } });
    const data = {
      name: input.name,
      description: input.description,
      businessType: input.businessType,
      phone: input.phone,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      ...(hoursRaw !== null ? { openingHours: hours as unknown as Prisma.InputJsonValue } : {}),
    };

    if (!existing) {
      const created = await tx.merchant.create({ data: { ownerId: actor.id, ...data } });
      await writeAudit({ actorId: actor.id, action: "MERCHANT_CREATED", entityType: "Merchant", entityId: created.id, after: { name: input.name, businessType: input.businessType } }, tx);
      return { ok: true, created: true };
    }
    if (!canEditOwnProfile(actor, existing)) return { ok: false, error: "LOCKED" };

    await tx.merchant.update({ where: { id: existing.id }, data });
    await writeAudit(
      {
        actorId: actor.id,
        action: "MERCHANT_PROFILE_UPDATED",
        entityType: "Merchant",
        entityId: existing.id,
        before: { name: existing.name, businessType: existing.businessType },
        after: { name: input.name, businessType: input.businessType },
      },
      tx,
    );
    return { ok: true, created: false };
  });
}

/** A rejected shop sends itself back to review after fixing its details. */
export async function resubmitOwnMerchant(actor: Actor): Promise<{ ok: boolean }> {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  return db.$transaction(async (tx) => {
    const shop = await tx.merchant.findUnique({ where: { ownerId: actor.id } });
    if (!shop) throw new NotFoundError();
    const move = applyMerchantAction(shop.status, "RESUBMIT");
    if (!move.ok) return { ok: false };
    await tx.merchant.update({ where: { id: shop.id }, data: { status: move.next, rejectionReason: null } });
    await writeAudit({ actorId: actor.id, action: "MERCHANT_RESUBMITTED", entityType: "Merchant", entityId: shop.id, before: { status: shop.status }, after: { status: move.next } }, tx);
    return { ok: true };
  });
}

export type ReviewResult = { ok: true } | { ok: false; error: "INVALID_TRANSITION" | "REASON_REQUIRED" };

/** Admin decision on a shop. Needs merchants.review; every decision is audited with its reason. */
export async function reviewMerchant(actor: Actor, merchantId: string, action: Exclude<MerchantAction, "RESUBMIT">, reason?: string): Promise<ReviewResult> {
  if (!hasPermission(actor, "merchants.review")) throw new AuthorizationError();
  return db.$transaction(async (tx): Promise<ReviewResult> => {
    const shop = await tx.merchant.findUnique({ where: { id: merchantId } });
    if (!shop) throw new NotFoundError();
    const move = applyMerchantAction(shop.status, action, reason);
    if (!move.ok) return move;

    const cleanReason = (reason ?? "").trim() || null;
    await tx.merchant.update({
      where: { id: shop.id },
      data: { status: move.next, rejectionReason: move.next === "REJECTED" ? cleanReason : null, reviewedById: actor.id, reviewedAt: new Date() },
    });
    await writeAudit(
      {
        actorId: actor.id,
        action: `MERCHANT_${action}`,
        entityType: "Merchant",
        entityId: shop.id,
        before: { status: shop.status },
        after: { status: move.next, ...(cleanReason ? { reason: cleanReason } : {}) },
      },
      tx,
    );
    return { ok: true };
  });
}

/**
 * Change a shop's membership tier (Basic/Premium). Only affects orders created AFTER the change: every order
 * stores the tier and commission it was priced with.
 */
export async function setMerchantTier(actor: Actor, merchantId: string, tier: MerchantTier, reason: string): Promise<{ ok: boolean }> {
  if (!hasPermission(actor, "merchants.review")) throw new AuthorizationError();
  if (reason.trim().length < 3) return { ok: false };
  return db.$transaction(async (tx) => {
    const shop = await tx.merchant.findUnique({ where: { id: merchantId } });
    if (!shop) throw new NotFoundError();
    if (shop.tier === tier) return { ok: true };
    await tx.merchant.update({ where: { id: shop.id }, data: { tier } });
    await writeAudit({ actorId: actor.id, action: "MERCHANT_TIER_CHANGED", entityType: "Merchant", entityId: shop.id, before: { tier: shop.tier }, after: { tier, reason: reason.trim() } }, tx);
    return { ok: true };
  });
}

export async function listMerchantsForAdmin(actor: Actor, status?: MerchantStatus) {
  if (!hasPermission(actor, "merchants.review")) throw new AuthorizationError();
  return db.merchant.findMany({
    where: status ? { status } : {},
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    include: { owner: { select: { name: true, phone: true } }, businessTypeRef: { select: { nameAr: true } } },
  });
}
