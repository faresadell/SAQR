import "server-only";
import { db } from "@/lib/db";
import { isOpenAt, validateOpeningHours } from "@/lib/catalog/opening-hours";

/**
 * Customer-facing catalog reads (the browsing UI arrives in Phase 4). Only APPROVED merchants, only products that
 * are not archived and sit in an active category are returned, and only public fields: no owner ids, no phone numbers
 * of the owner account, no review or tier data.
 */
export async function listPublicMerchants(filter: { q?: string; businessType?: string } = {}, at: Date = new Date()) {
  const q = (filter.q ?? "").trim().slice(0, 60);
  const rows = await db.merchant.findMany({
    where: {
      status: "APPROVED",
      ...(filter.businessType ? { businessType: filter.businessType } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ name: "asc" }],
    take: 100,
    select: { id: true, name: true, description: true, businessType: true, address: true, openingHours: true },
  });
  return rows.map((r) => {
    const hours = r.openingHours === null ? null : validateOpeningHours(r.openingHours);
    return { id: r.id, name: r.name, description: r.description, businessType: r.businessType, address: r.address, isOpen: isOpenAt(hours?.ok ? hours.value : null, at) };
  });
}

export async function getPublicMenu(merchantId: string, filter: { q?: string; categoryId?: string } = {}) {
  const shop = await db.merchant.findFirst({ where: { id: merchantId, status: "APPROVED" }, select: { id: true, name: true, description: true } });
  if (!shop) return null;
  const q = (filter.q ?? "").trim().slice(0, 60);
  const products = await db.product.findMany({
    where: {
      merchantId: shop.id,
      archivedAt: null,
      category: { isActive: true, archivedAt: null, OR: [{ parentId: null }, { parent: { isActive: true, archivedAt: null } }] },
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(q ? { nameAr: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { nameAr: "asc" }],
    take: 300,
    select: { id: true, nameAr: true, description: true, priceCents: true, isAvailable: true, categoryId: true },
  });
  return { merchant: shop, products };
}
