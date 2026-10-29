import { toLatinDigits } from "../auth/phone";
import { MoneyError, parseEgp } from "../money";

export const MAX_PRODUCT_PRICE_CENTS = 10_000_000; // 100,000 EGP: typo guard
export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 1000;

export interface ProductInput {
  nameAr: string;
  description: string | null;
  priceCents: number;
  categoryId: string;
  isAvailable: boolean;
}
export type ProductField = "name" | "description" | "price" | "categoryId";
export type ProductResult = { ok: true; value: ProductInput } | { ok: false; errors: Partial<Record<ProductField, string>> };

/** Collapse whitespace and drop control characters. Output is plain text; React escapes it on render. */
export function cleanText(input: string): string {
  return input.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

export function validateProductInput(raw: { name?: string; description?: string; price?: string; categoryId?: string; isAvailable?: boolean }): ProductResult {
  const errors: Partial<Record<ProductField, string>> = {};
  const name = cleanText(raw.name ?? "");
  if (name.length < 2 || name.length > NAME_MAX) errors.name = "اكتب اسماً من حرفين إلى 120 حرفاً.";

  const description = cleanText(raw.description ?? "");
  if (description.length > DESCRIPTION_MAX) errors.description = "الوصف طويل جداً (الحد 1000 حرف).";

  let priceCents = 0;
  try {
    priceCents = parseEgp(toLatinDigits(raw.price ?? "").replace(/[٫,]/g, "."));
    if (priceCents < 1 || priceCents > MAX_PRODUCT_PRICE_CENTS) errors.price = "السعر يجب أن يكون بين 0.01 و100000 جنيه.";
  } catch (error) {
    if (!(error instanceof MoneyError)) throw error;
    errors.price = "اكتب سعراً صحيحاً (حتى رقمين عشريين).";
  }

  const categoryId = (raw.categoryId ?? "").trim();
  if (!categoryId || categoryId.length > 64) errors.categoryId = "اختر التصنيف.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { nameAr: name, description: description || null, priceCents, categoryId, isAvailable: raw.isAvailable ?? true } };
}
