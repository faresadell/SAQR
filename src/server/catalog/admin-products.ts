import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { cleanText, validateProductInput, type ProductField } from "@/lib/catalog/product-input";
import { AuthorizationError, NotFoundError } from "@/server/errors";

/**
 * Admin control over every shop's products, so changes never need a developer. Needs `catalog.manage`.
 * Archiving a product is the takedown: the shop can no longer see or re-enable it, customers cannot order it, past orders keep
 * their snapshots. `restore` brings it back. Every change is audited with `byAdmin` and the reason when one is given.
 */
export type AdminProductResult = { ok: true } | { ok: false; error: "INVALID"; errors: Partial<Record<ProductField, string>> } | { ok: false; error: "CATEGORY_UNAVAILABLE" | "SHOP_NOT_APPROVED" | "REASON_REQUIRED" };

function assertAdmin(actor: Actor): void {
  if (!hasPermission(actor, "catalog.manage")) throw new AuthorizationError();
}

type Client = Prisma.TransactionClient | typeof db;

async function categoryUsable(client: Client, categoryId: string): Promise<boolean> {
  const category = await client.category.findUnique({ where: { id: categoryId } });
  if (!category || !category.isActive || category.archivedAt) return false;
  if (category.parentId) {
    const parent = await client.category.findUnique({ where: { id: category.parentId } });
    if (!parent || !parent.isActive || parent.archivedAt) return false;
  }
  return true;
}

export interface AdminProductFilter {
  merchantId?: string;
  q?: string;
  archived?: boolean;
}

export async function listProductsForAdmin(actor: Actor, filter: AdminProductFilter = {}) {
  assertAdmin(actor);
  const q = typeof filter.q === "string" ? cleanText(filter.q).slice(0, 60) : "";
  return db.product.findMany({
    where: {
      archivedAt: filter.archived ? { not: null } : null,
      ...(filter.merchantId ? { merchantId: filter.merchantId } : {}),
      ...(q ? { nameAr: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: { id: true, nameAr: true, description: true, priceCents: true, isAvailable: true, archivedAt: true, categoryId: true, merchantId: true, merchant: { select: { name: true } }, category: { select: { nameAr: true } } },
  });
}

export async function adminCreateProduct(actor: Actor, merchantId: string, raw: Parameters<typeof validateProductInput>[0]): Promise<AdminProductResult> {
  assertAdmin(actor);
  const parsed = validateProductInput(raw);
  if (!parsed.ok) return { ok: false, error: "INVALID", errors: parsed.errors };
  return db.$transaction(async (tx): Promise<AdminProductResult> => {
    const shop = await tx.merchant.findUnique({ where: { id: merchantId } });
    if (!shop) throw new NotFoundError();
    if (shop.status !== "APPROVED") return { ok: false, error: "SHOP_NOT_APPROVED" };
    if (!(await categoryUsable(tx, parsed.value.categoryId))) return { ok: false, error: "CATEGORY_UNAVAILABLE" };
    const product = await tx.product.create({ data: { merchantId, ...parsed.value } });
    await writeAudit({ actorId: actor.id, action: "PRODUCT_CREATED", entityType: "Product", entityId: product.id, after: { nameAr: product.nameAr, priceCents: product.priceCents, merchantId, byAdmin: true } }, tx);
    return { ok: true };
  });
}

export async function adminUpdateProduct(actor: Actor, productId: string, raw: Parameters<typeof validateProductInput>[0]): Promise<AdminProductResult> {
  assertAdmin(actor);
  const parsed = validateProductInput(raw);
  if (!parsed.ok) return { ok: false, error: "INVALID", errors: parsed.errors };
  return db.$transaction(async (tx): Promise<AdminProductResult> => {
    const current = await tx.product.findFirst({ where: { id: productId, archivedAt: null } });
    if (!current) throw new NotFoundError();
    if (current.categoryId !== parsed.value.categoryId && !(await categoryUsable(tx, parsed.value.categoryId))) return { ok: false, error: "CATEGORY_UNAVAILABLE" };
    await tx.product.update({ where: { id: current.id }, data: parsed.value });
    // Existing orders keep their own price snapshot, so a price change only affects future orders.
    await writeAudit(
      { actorId: actor.id, action: "PRODUCT_UPDATED", entityType: "Product", entityId: current.id, before: { nameAr: current.nameAr, priceCents: current.priceCents, isAvailable: current.isAvailable }, after: { nameAr: parsed.value.nameAr, priceCents: parsed.value.priceCents, isAvailable: parsed.value.isAvailable, byAdmin: true } },
      tx,
    );
    return { ok: true };
  });
}

export async function adminSetProductAvailability(actor: Actor, productId: string, isAvailable: boolean): Promise<void> {
  assertAdmin(actor);
  await db.$transaction(async (tx) => {
    const current = await tx.product.findFirst({ where: { id: productId, archivedAt: null } });
    if (!current) throw new NotFoundError();
    if (current.isAvailable === isAvailable) return;
    await tx.product.update({ where: { id: current.id }, data: { isAvailable } });
    await writeAudit({ actorId: actor.id, action: "PRODUCT_AVAILABILITY_CHANGED", entityType: "Product", entityId: current.id, before: { isAvailable: current.isAvailable }, after: { isAvailable, byAdmin: true } }, tx);
  });
}

/** Takedown. The reason is required and kept in the audit log; the shop cannot undo it. */
export async function adminArchiveProduct(actor: Actor, productId: string, reason: string): Promise<AdminProductResult> {
  assertAdmin(actor);
  const clean = typeof reason === "string" ? cleanText(reason) : "";
  if (clean.length < 3 || clean.length > 300) return { ok: false, error: "REASON_REQUIRED" };
  return db.$transaction(async (tx): Promise<AdminProductResult> => {
    const current = await tx.product.findFirst({ where: { id: productId, archivedAt: null } });
    if (!current) throw new NotFoundError();
    await tx.product.update({ where: { id: current.id }, data: { archivedAt: new Date(), isAvailable: false } });
    await writeAudit({ actorId: actor.id, action: "PRODUCT_ARCHIVED", entityType: "Product", entityId: current.id, before: { nameAr: current.nameAr }, after: { reason: clean, byAdmin: true } }, tx);
    return { ok: true };
  });
}

/** Brings an archived product back (hidden from customers until the shop or an admin makes it available). */
export async function adminRestoreProduct(actor: Actor, productId: string): Promise<void> {
  assertAdmin(actor);
  await db.$transaction(async (tx) => {
    const current = await tx.product.findFirst({ where: { id: productId, archivedAt: { not: null } } });
    if (!current) throw new NotFoundError();
    await tx.product.update({ where: { id: current.id }, data: { archivedAt: null, isAvailable: false } });
    await writeAudit({ actorId: actor.id, action: "PRODUCT_RESTORED", entityType: "Product", entityId: current.id, after: { byAdmin: true } }, tx);
  });
}

/** Approved shops an admin can add products to or filter by. */
export async function listShopOptions(actor: Actor) {
  assertAdmin(actor);
  return db.merchant.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 500 });
}
