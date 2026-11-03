"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { DENIED_ERROR, GENERIC_ERROR, NOT_FOUND_ERROR, OFFER_MESSAGES } from "@/features/shared/messages";
import { requirePermission } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { createOfferAsAdmin } from "@/server/offers/service";

const get = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
};

/** Same rules as the shop's own form: the service applies every limit; nothing here can loosen them. */
export async function createOfferAsAdminAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePermission("offers.manage");
  const type = get(formData, "discountType");
  const productIds = formData.getAll("productIds").filter((v): v is string => typeof v === "string");
  let discount: { type: "PERCENT" | "FIXED"; value: number } | null = null;
  if (type === "PERCENT" || type === "FIXED") {
    const raw = Number(get(formData, "discountValue").replace(",", "."));
    if (!Number.isFinite(raw) || raw <= 0) return { fieldErrors: { discountValue: "اكتب قيمة خصم صحيحة." } };
    discount = { type, value: Math.round(raw * 100) }; // percent in basis points, fixed in piasters per unit
  }
  try {
    const result = await createOfferAsAdmin(user, get(formData, "merchantId"), { title: get(formData, "title"), description: get(formData, "description") || null, discount, productIds });
    if (!result.ok) return { error: OFFER_MESSAGES[result.error] ?? GENERIC_ERROR };
    revalidatePath("/admin/offers");
    revalidatePath("/offers");
    return { message: "تم نشر العرض نيابةً عن النشاط وتسجيله في سجل المراجعة." };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}
