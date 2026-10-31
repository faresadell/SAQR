import "server-only";
import { listBusinessTypes } from "@/server/catalog/categories";
import { listUsableCategories } from "@/server/catalog/products";
import { getPublicMenu, listPublicMerchants } from "@/server/catalog/public";
import { unavailable, type Loaded } from "@/features/shared/loaded";
import type { BusinessTypeOption, CategoryOption, MenuProduct, ShopSummary } from "./types";

/**
 * Read-only adapters over the EXISTING public catalog services. Nothing here writes data or invents an endpoint.
 */

export async function loadBusinessTypes(): Promise<BusinessTypeOption[]> {
  const rows = await listBusinessTypes(true);
  return rows.map((r) => ({ code: r.code, nameAr: r.nameAr }));
}

export async function loadShops(filter: { q?: string; businessType?: string } = {}): Promise<ShopSummary[]> {
  return listPublicMerchants(filter);
}

export async function loadCategories(): Promise<CategoryOption[]> {
  return listUsableCategories();
}

export interface ShopPage {
  shop: ShopSummary;
  products: MenuProduct[];
}

/**
 * Shop details + menu. `getPublicMenu` returns only name/description, so address, type and open/closed come
 * from `listPublicMerchants` (matched by id). Backend wish: a `getPublicMerchant(id)` that returns them directly.
 */
export async function loadShopPage(merchantId: string, filter: { q?: string; categoryId?: string } = {}): Promise<ShopPage | null> {
  const menu = await getPublicMenu(merchantId, filter);
  if (!menu) return null;
  const candidates = await listPublicMerchants({ q: menu.merchant.name });
  const summary = candidates.find((s) => s.id === merchantId);
  const shop: ShopSummary = summary ?? {
    id: menu.merchant.id,
    name: menu.merchant.name,
    description: menu.merchant.description,
    businessType: "",
    address: null,
    isOpen: true,
  };
  return { shop, products: menu.products };
}

/** Active offers: there is no offers model or service yet. */
export async function loadOffers(): Promise<Loaded<never>> {
  return unavailable("public.offers");
}
