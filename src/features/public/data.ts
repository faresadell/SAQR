import "server-only";
import { listBusinessTypes } from "@/server/catalog/categories";
import { listUsableCategories } from "@/server/catalog/products";
import { getPublicMenu, listPublicMerchants } from "@/server/catalog/public";
import { listPublicOffers } from "@/server/offers/service";
import { failed, ready, type Loaded } from "@/features/shared/loaded";
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

export interface PublicOfferView {
  id: string;
  title: string;
  description: string | null;
  endsAt: string;
  shop: { id: string; name: string };
  /** Human label such as "خصم 20%" — null when the offer is informational only (discounts off or none set). */
  discountLabel: string | null;
  products: { id: string; name: string; priceCents: number; finalPriceCents: number }[];
}

/** Running offers from the real offers service. Discounted products appear only while the admin has discounts enabled. */
export async function loadOffers(): Promise<Loaded<PublicOfferView[]>> {
  try {
    const rows = await listPublicOffers();
    return ready(
      rows.map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        endsAt: o.endsAt.toISOString(),
        shop: o.shop,
        discountLabel: o.discount ? (o.discount.type === "PERCENT" ? `خصم ${o.discount.value / 100}%` : `خصم ${o.discount.value / 100} جنيه للوحدة`) : null,
        products: o.products,
      })),
    );
  } catch {
    return failed("تعذر تحميل العروض. حاول مرة أخرى.");
  }
}
