import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/permissions";
import { canManageOwnCatalog } from "@/lib/catalog/catalog-policy";
import { validateProductInput, type ProductField } from "@/lib/catalog/product-input";
import { AuthorizationError, NotFoundError } from "@/server/errors";

type Client = Prisma.TransactionClient | typeof db;
export type ProductResult = { ok: true } | { ok: false; error: "INVALID"; errors: Partial<Record<ProductField, string>> } | { ok: false; error: "CATEGORY_UNAVAILABLE" };

/**
 * The merchant whose catalog this actor may change. Derived from the SESSION user, never from the request,
 * and only for an owner whose shop is approved. Anything else is an authorization error.
 */
async function requireOwnApprovedMerchant(actor: Actor, client: Client) {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const shop = await client.merchant.findUnique({ where: { ownerId: actor.id } });
  if (!shop || !canManageOwnCatalog(actor, shop)) throw new AuthorizationError();
  return shop;
}

/** A product can only be placed in a category customers can actually browse. */
async function categoryUsable(client: Client, categoryId: string): Promise<boolean> {
  const category = await client.category.findUnique({ where: { id: categoryId } });
  if (!category || !category.isActive || category.archivedAt) return false;
  if (category.parentId) {
    const parent = await client.category.findUnique({ where: { id: category.parentId } });
    if (!parent || !parent.isActive || parent.archivedAt) return false;
  }
  return true;
}

/** Product lookup that CANNOT cross merchants: the merchant id is part of the query (IDOR protection). */
async function findOwnProduct(client: Client, merchantId: string, productId: string) {
  const product = await client.product.findFirst({ where: { id: productId, merchantId, archivedAt: null } });
  if (!product) throw new NotFoundError();
  return product;
}

export async function createProduct(actor: Actor, raw: Parameters<typeof validateProductInput>[0]): Promise<ProductResult> {
  const parsed = validateProductInput(raw);
  if (!parsed.ok) {
    await requireOwnApprovedMerchant(actor, db); // authorization failures win over validation hints
    return { ok: false, error: "INVALID", errors: parsed.errors };
  }
  return db.$transaction(async (tx): Promise<ProductResult> => {
    const shop = await requireOwnApprovedMerchant(actor, tx);
    if (!(await categoryUsable(tx, parsed.value.categoryId))) return { ok: false, error: "CATEGORY_UNAVAILABLE" };
    const product = await tx.product.create({
      data: { merchantId: shop.id, categoryId: parsed.value.categoryId, nameAr: parsed.value.nameAr, description: parsed.value.description, priceCents: parsed.value.priceCents, isAvailable: parsed.value.isAvailable },
    });
    await writeAudit({ actorId: actor.id, action: "PRODUCT_CREATED", entityType: "Product", entityId: product.id, after: { nameAr: product.nameAr, priceCents: product.priceCents } }, tx);
    return { ok: true };
  });
}

export async function updateProduct(actor: Actor, productId: string, raw: Parameters<typeof validateProductInput>[0]): Promise<ProductResult> {
  const parsed = validateProductInput(raw);
  if (!parsed.ok) {
    await requireOwnApprovedMerchant(actor, db);
    return { ok: false, error: "INVALID", errors: parsed.errors };
  }
  return db.$transaction(async (tx): Promise<ProductResult> => {
    const shop = await requireOwnApprovedMerchant(actor, tx);
    const current = await findOwnProduct(tx, shop.id, productId);
    if (current.categoryId !== parsed.value.categoryId && !(await categoryUsable(tx, parsed.value.categoryId))) {
      return { ok: false, error: "CATEGORY_UNAVAILABLE" };
    }
    await tx.product.update({
      where: { id: current.id },
      data: { categoryId: parsed.value.categoryId, nameAr: parsed.value.nameAr, description: parsed.value.description, priceCents: parsed.value.priceCents, isAvailable: parsed.value.isAvailable },
    });
    // Existing orders keep their own price snapshot, so a price change only affects future orders.
    await writeAudit(
      { actorId: actor.id, action: "PRODUCT_UPDATED", entityType: "Product", entityId: current.id, before: { nameAr: current.nameAr, priceCents: current.priceCents, isAvailable: current.isAvailable }, after: { nameAr: parsed.value.nameAr, priceCents: parsed.value.priceCents, isAvailable: parsed.value.isAvailable } },
      tx,
    );
    return { ok: true };
  });
}

export async function setProductAvailability(actor: Actor, productId: string, isAvailable: boolean): Promise<void> {
  await db.$transaction(async (tx) => {
    const shop = await requireOwnApprovedMerchant(actor, tx);
    const current = await findOwnProduct(tx, shop.id, productId);
    if (current.isAvailable === isAvailable) return;
    await tx.product.update({ where: { id: current.id }, data: { isAvailable } });
    await writeAudit({ actorId: actor.id, action: "PRODUCT_AVAILABILITY_CHANGED", entityType: "Product", entityId: current.id, before: { isAvailable: current.isAvailable }, after: { isAvailable } }, tx);
  });
}

/** Archive, never delete: past orders keep their product references. */
export async function archiveProduct(actor: Actor, productId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const shop = await requireOwnApprovedMerchant(actor, tx);
    const current = await findOwnProduct(tx, shop.id, productId);
    await tx.product.update({ where: { id: current.id }, data: { archivedAt: new Date(), isAvailable: false } });
    await writeAudit({ actorId: actor.id, action: "PRODUCT_ARCHIVED", entityType: "Product", entityId: current.id, before: { nameAr: current.nameAr } }, tx);
  });
}

export async function listOwnProducts(actor: Actor) {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const shop = await db.merchant.findUnique({ where: { ownerId: actor.id } });
  if (!shop) return [];
  return db.product.findMany({ where: { merchantId: shop.id, archivedAt: null }, orderBy: [{ createdAt: "desc" }], include: { category: { select: { nameAr: true } } } });
}

/** Categories a merchant can pick for a product (active, not archived, and under an active parent). */
export async function listUsableCategories() {
  const roots = await db.category.findMany({
    where: { parentId: null, isActive: true, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }],
    include: { children: { where: { isActive: true, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }] } },
  });
  return roots.flatMap((root) => [{ id: root.id, label: root.nameAr }, ...root.children.map((child) => ({ id: child.id, label: `${root.nameAr} › ${child.nameAr}` }))]);
}
