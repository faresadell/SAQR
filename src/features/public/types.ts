/** Public storefront shapes. They match what `src/server/catalog/public.ts` returns today. */
export interface ShopSummary {
  id: string;
  name: string;
  description: string | null;
  businessType: string;
  address: string | null;
  isOpen: boolean;
}

export interface MenuProduct {
  id: string;
  nameAr: string;
  description: string | null;
  priceCents: number;
  isAvailable: boolean;
  categoryId: string;
}

export interface BusinessTypeOption {
  code: string;
  nameAr: string;
}

export interface CategoryOption {
  id: string;
  label: string;
}
