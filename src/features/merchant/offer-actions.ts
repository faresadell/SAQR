"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { createOffer, extendOffer, stopOffer, type OfferResult } from "@/server/offers/service";
import { DENIED_ERROR, GENERIC_ERROR, NOT_FOUND_ERROR, OFFER_MESSAGES } from "@/features/shared/messages";

const get = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
};

async function guarded(work: () => Promise<OfferResult<object>>, success: string): Promise<FormState> {
  try {
    const result = await work();
    if (!result.ok) return { error: OFFER_MESSAGES[result.error] ?? GENERIC_ERROR };
    revalidatePath("/merchant", "layout");
    revalidatePath("/offers");
    return { message: success };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}

export async function createOfferAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  const type = get(formData, "discountType");
  const productIds = formData.getAll("productIds").filter((v): v is string => typeof v === "string");
  const raw = Number(get(formData, "discountValue").replace(",", "."));
  let discount: { type: "PERCENT" | "FIXED"; value: number } | null = null;
  if (type === "PERCENT" || type === "FIXED") {
    if (!Number.isFinite(raw) || raw <= 0) return { fieldErrors: { discountValue: "اكتب قيمة خصم صحيحة." } };
    // Percent is stored in basis points (15% = 1500); fixed amounts in piasters per unit.
    discount = { type, value: Math.round(raw * 100) };
  }
  return guarded(() => createOffer(user, { title: get(formData, "title"), description: get(formData, "description") || null, discount, productIds }), "تم نشر العرض.");
}

export async function extendOfferAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  const hours = Number(get(formData, "hours"));
  return guarded(() => extendOffer(user, get(formData, "offerId"), { hours, idempotencyKey: get(formData, "idempotencyKey") }), "تم تمديد العرض.");
}

export async function stopOfferAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  return guarded(() => stopOffer(user, get(formData, "offerId"), get(formData, "reason")), "تم إيقاف العرض.");
}
