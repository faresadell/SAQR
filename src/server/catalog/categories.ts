import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { validateBusinessTypeInput, validateCategoryInput, type CategoryField } from "@/lib/catalog/merchant-input";
import { AuthorizationError, NotFoundError } from "@/server/errors";

type Client = Prisma.TransactionClient | typeof db;

function assertCanManage(actor: Actor): void {
  if (!hasPermission(actor, "catalog.manage")) throw new AuthorizationError();
}

export type CategoryResult =
  | { ok: true }
  | { ok: false; error: "INVALID"; errors: Partial<Record<CategoryField, string>> }
  | { ok: false; error: "PARENT_INVALID" | "DUPLICATE" | "HAS_ACTIVE_CHILDREN" };

async function siblingExists(client: Client, parentId: string | null, nameAr: string, exceptId?: string): Promise<boolean> {
  const found = await client.category.findFirst({ where: { parentId, nameAr, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  return found !== null;
}

/** Two levels only: a category, and sub-categories under it. */
export async function createCategory(actor: Actor, raw: { nameAr?: string; nameEn?: string; sortOrder?: string }, parentId: string | null): Promise<CategoryResult> {
  assertCanManage(actor);
  const parsed = validateCategoryInput(raw);
  if (!parsed.ok) return { ok: false, error: "INVALID", errors: parsed.errors };

  return db.$transaction(async (tx): Promise<CategoryResult> => {
    if (parentId) {
      const parent = await tx.category.findUnique({ where: { id: parentId } });
      if (!parent || parent.parentId !== null || parent.archivedAt) return { ok: false, error: "PARENT_INVALID" };
    }
    if (await siblingExists(tx, parentId, parsed.value.nameAr)) return { ok: false, error: "DUPLICATE" };
    const created = await tx.category.create({ data: { parentId, ...parsed.value } });
    await writeAudit({ actorId: actor.id, action: "CATEGORY_CREATED", entityType: "Category", entityId: created.id, after: { nameAr: created.nameAr, parentId } }, tx);
    return { ok: true };
  });
}

export async function updateCategory(actor: Actor, id: string, raw: { nameAr?: string; nameEn?: string; sortOrder?: string }): Promise<CategoryResult> {
  assertCanManage(actor);
  const parsed = validateCategoryInput(raw);
  if (!parsed.ok) return { ok: false, error: "INVALID", errors: parsed.errors };
  return db.$transaction(async (tx): Promise<CategoryResult> => {
    const current = await tx.category.findUnique({ where: { id } });
    if (!current || current.archivedAt) throw new NotFoundError();
    if (await siblingExists(tx, current.parentId, parsed.value.nameAr, id)) return { ok: false, error: "DUPLICATE" };
    await tx.category.update({ where: { id }, data: parsed.value });
    await writeAudit(
      { actorId: actor.id, action: "CATEGORY_UPDATED", entityType: "Category", entityId: id, before: { nameAr: current.nameAr, sortOrder: current.sortOrder }, after: { nameAr: parsed.value.nameAr, sortOrder: parsed.value.sortOrder } },
      tx,
    );
    return { ok: true };
  });
}

/** Hide or show a category. Hidden categories keep their products and history; customers just stop seeing them. */
export async function setCategoryActive(actor: Actor, id: string, isActive: boolean): Promise<void> {
  assertCanManage(actor);
  await db.$transaction(async (tx) => {
    const current = await tx.category.findUnique({ where: { id } });
    if (!current || current.archivedAt) throw new NotFoundError();
    if (current.isActive === isActive) return;
    await tx.category.update({ where: { id }, data: { isActive } });
    await writeAudit({ actorId: actor.id, action: "CATEGORY_ACTIVE_CHANGED", entityType: "Category", entityId: id, before: { isActive: current.isActive }, after: { isActive } }, tx);
  });
}

/** Archive instead of delete: historical orders keep pointing at the row. A category with live sub-categories cannot be archived. */
export async function archiveCategory(actor: Actor, id: string): Promise<CategoryResult> {
  assertCanManage(actor);
  return db.$transaction(async (tx): Promise<CategoryResult> => {
    const current = await tx.category.findUnique({ where: { id } });
    if (!current || current.archivedAt) throw new NotFoundError();
    if ((await tx.category.count({ where: { parentId: id, archivedAt: null } })) > 0) return { ok: false, error: "HAS_ACTIVE_CHILDREN" };
    await tx.category.update({ where: { id }, data: { archivedAt: new Date(), isActive: false } });
    await writeAudit({ actorId: actor.id, action: "CATEGORY_ARCHIVED", entityType: "Category", entityId: id, before: { nameAr: current.nameAr } }, tx);
    return { ok: true };
  });
}

export async function listCategoryTree(actor: Actor) {
  assertCanManage(actor);
  return db.category.findMany({
    where: { parentId: null, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }],
    include: { children: { where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }] } },
  });
}

// ───────────── business types ─────────────

export type BusinessTypeResult = { ok: true } | { ok: false; error: "INVALID" | "DUPLICATE"; errors?: Partial<Record<"code" | "nameAr", string>> };

export async function createBusinessType(actor: Actor, raw: { code?: string; nameAr?: string }): Promise<BusinessTypeResult> {
  assertCanManage(actor);
  const parsed = validateBusinessTypeInput(raw);
  if (!parsed.ok) return { ok: false, error: "INVALID", errors: parsed.errors };
  return db.$transaction(async (tx): Promise<BusinessTypeResult> => {
    if (await tx.businessType.findUnique({ where: { code: parsed.value.code } })) return { ok: false, error: "DUPLICATE" };
    await tx.businessType.create({ data: parsed.value });
    await writeAudit({ actorId: actor.id, action: "BUSINESS_TYPE_CREATED", entityType: "BusinessType", entityId: parsed.value.code, after: parsed.value }, tx);
    return { ok: true };
  });
}

export async function setBusinessTypeActive(actor: Actor, code: string, isActive: boolean): Promise<void> {
  assertCanManage(actor);
  await db.$transaction(async (tx) => {
    const current = await tx.businessType.findUnique({ where: { code } });
    if (!current) throw new NotFoundError();
    if (current.isActive === isActive) return;
    await tx.businessType.update({ where: { code }, data: { isActive } });
    await writeAudit({ actorId: actor.id, action: "BUSINESS_TYPE_ACTIVE_CHANGED", entityType: "BusinessType", entityId: code, before: { isActive: current.isActive }, after: { isActive } }, tx);
  });
}

export async function listBusinessTypes(activeOnly = false) {
  return db.businessType.findMany({ where: activeOnly ? { isActive: true } : {}, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
}
