import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { validateMerchantInput, type MerchantField } from "@/lib/catalog/merchant-input";
import { validateShopContact, type ShopContactField, type SocialKey } from "@/lib/catalog/shop-contact";
import { detectImage, MAX_RECEIPT_BYTES } from "@/lib/uploads/image-sniff";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { getStorage } from "@/server/uploads/storage";

export interface AdminShopInput {
  name?: string;
  description?: string;
  businessType?: string;
  phone?: string;
  address?: string;
  lat?: string;
  lng?: string;
  phones?: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  whatsapp?: string;
  website?: string;
}
type Field = MerchantField | ShopContactField | "owner";
export type AdminShopResult = { ok: true; id: string } | { ok: false; error: "INVALID"; errors: Partial<Record<Field, string>> };

function need(actor: Actor): void {
  if (!hasPermission(actor, "merchants.review")) throw new AuthorizationError();
}

/** Active merchant accounts that do not own a shop yet: the choices for "who owns this shop". */
export async function listOwnerCandidates(actor: Actor) {
  need(actor);
  return db.user.findMany({ where: { role: "MERCHANT", status: "ACTIVE", merchant: null }, orderBy: { name: "asc" }, take: 200, select: { id: true, name: true, phone: true } });
}

function parse(input: AdminShopInput) {
  const base = validateMerchantInput(input);
  const social: Partial<Record<SocialKey, string>> = {};
  for (const key of ["facebook", "instagram", "tiktok", "whatsapp", "website"] as const) if (input[key]) social[key] = input[key]!;
  const contact = validateShopContact({ ...(input.phones !== undefined ? { phones: input.phones } : {}), ...social });
  const errors: Partial<Record<Field, string>> = { ...(base.ok ? {} : base.errors), ...(contact.ok ? {} : contact.errors) };
  return { base, contact, errors };
}

/**
 * An admin adds a shop and chooses its owner (an existing active merchant account without a shop). The shop is approved
 * at once; from then on orders for it reach that owner like any other shop's. Audited with admin, owner and shop.
 */
export async function createShopByAdmin(actor: Actor, ownerId: string, input: AdminShopInput): Promise<AdminShopResult> {
  need(actor);
  const { base, contact, errors } = parse(input);
  if (!base.ok || !contact.ok) return { ok: false, error: "INVALID", errors };
  return db.$transaction(async (tx): Promise<AdminShopResult> => {
    const owner = await tx.user.findFirst({ where: { id: ownerId, role: "MERCHANT", status: "ACTIVE", merchant: null }, select: { id: true } });
    if (!owner) return { ok: false, error: "INVALID", errors: { owner: "اختر صاحب نشاط صالحاً (حساب تاجر مفعّل ليس له نشاط)." } };
    const type = await tx.businessType.findUnique({ where: { code: base.value.businessType } });
    if (!type?.isActive) return { ok: false, error: "INVALID", errors: { businessType: "نوع النشاط غير متاح." } };
    const created = await tx.merchant.create({
      data: {
        ownerId: owner.id,
        ...base.value,
        contactPhones: contact.value.contactPhones,
        ...(contact.value.socialLinks ? { socialLinks: contact.value.socialLinks as Prisma.InputJsonValue } : {}),
        status: "APPROVED",
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
    });
    await writeAudit({ actorId: actor.id, action: "MERCHANT_CREATED_BY_ADMIN", entityType: "Merchant", entityId: created.id, after: { name: base.value.name, businessType: base.value.businessType, ownerId: owner.id } }, tx);
    return { ok: true, id: created.id };
  });
}

/** An admin edits any shop's details (name, address, contacts...). Validated like the owner's own form; before/after audited. */
export async function updateShopByAdmin(actor: Actor, merchantId: string, input: AdminShopInput): Promise<AdminShopResult> {
  need(actor);
  const { base, contact, errors } = parse(input);
  if (!base.ok || !contact.ok) return { ok: false, error: "INVALID", errors };
  return db.$transaction(async (tx): Promise<AdminShopResult> => {
    const shop = await tx.merchant.findUnique({ where: { id: merchantId } });
    if (!shop) throw new NotFoundError();
    const type = await tx.businessType.findUnique({ where: { code: base.value.businessType } });
    if (!type?.isActive && base.value.businessType !== shop.businessType) return { ok: false, error: "INVALID", errors: { businessType: "نوع النشاط غير متاح." } };
    await tx.merchant.update({
      where: { id: shop.id },
      data: { ...base.value, contactPhones: contact.value.contactPhones, socialLinks: (contact.value.socialLinks ?? null) as Prisma.InputJsonValue },
    });
    await writeAudit(
      {
        actorId: actor.id,
        action: "MERCHANT_UPDATED_BY_ADMIN",
        entityType: "Merchant",
        entityId: shop.id,
        before: { name: shop.name, address: shop.address, businessType: shop.businessType, phone: shop.phone, contactPhones: shop.contactPhones },
        after: { name: base.value.name, address: base.value.address, businessType: base.value.businessType, phone: base.value.phone, contactPhones: contact.value.contactPhones },
      },
      tx,
    );
    return { ok: true, id: shop.id };
  });
}

export type ShopImageResult = { ok: true } | { ok: false; error: "INVALID_FILE" | "FILE_TOO_LARGE" };

/** The file type is decided from the bytes, never the name. A new key each time, so nothing is overwritten or cached stale. */
export async function uploadShopImage(actor: Actor, merchantId: string, bytes: Uint8Array): Promise<ShopImageResult> {
  need(actor);
  const shop = await db.merchant.findUnique({ where: { id: merchantId }, select: { id: true, imageKey: true } });
  if (!shop) throw new NotFoundError();
  if (bytes.length > MAX_RECEIPT_BYTES) return { ok: false, error: "FILE_TOO_LARGE" };
  const kind = detectImage(bytes);
  if (!kind) return { ok: false, error: "INVALID_FILE" };
  const key = `shop-images/${shop.id}/${randomUUID()}.${kind.ext}`;
  await getStorage().put(key, bytes);
  await db.$transaction(async (tx) => {
    await tx.merchant.update({ where: { id: shop.id }, data: { imageKey: key } });
    await writeAudit({ actorId: actor.id, action: "MERCHANT_IMAGE_SET", entityType: "Merchant", entityId: shop.id, before: { imageKey: shop.imageKey }, after: { imageKey: key, sizeBytes: bytes.length } }, tx);
  });
  return { ok: true };
}

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Public read: only for approved shops. */
export async function readShopImage(merchantId: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const shop = await db.merchant.findFirst({ where: { id: merchantId, status: "APPROVED" }, select: { imageKey: true } });
  if (!shop?.imageKey) return null;
  const bytes = await getStorage().get(shop.imageKey);
  const contentType = TYPES[shop.imageKey.split(".").pop() ?? ""];
  return bytes && contentType ? { bytes, contentType } : null;
}
