"use server";

import { logError } from "@/lib/log";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { uploadOfferImage } from "@/server/offers/images";
import { pickedImage } from "@/server/uploads/form-image";
import { createOffer, extendOffer, stopOffer, type OfferResult } from "@/server/offers/service";
import { DENIED_ERROR, GENERIC_ERROR, NOT_FOUND_ERROR, OFFER_MESSAGES } from "@/features/shared/messages";

const get = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
};

async function guarded(work: () => Promise<OfferResult<object>>, success: string, afterOk?: (result: object) => Promise<string | null>): Promise<FormState> {
  try {
    const result = await work();
    if (!result.ok) return { error: OFFER_MESSAGES[result.error] ?? GENERIC_ERROR };
    const note = afterOk ? await afterOk(result) : null;
    revalidatePath("/merchant", "layout");
    revalidatePath("/offers");
    return { message: note ?? success };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
    logError(error);
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
  return guarded(() => createOffer(user, { title: get(formData, "title"), description: get(formData, "description") || null, discount, productIds, ...(get(formData, "paidHours") ? { paidHours: Number(get(formData, "paidHours")) } : {}) }), "تم نشر العرض.", async (result) => {
    // The picture is optional and never blocks the offer: it is already published and charged at this point.
    const image = await pickedImage(formData);
    const offerId = (result as { offerId?: string }).offerId;
    if (!image || !offerId) return null;
    const stored = await uploadOfferImage(user, offerId, image);
    return stored.ok ? null : "تم نشر العرض، لكن تعذر رفع الصورة. يمكنك إضافتها من بطاقة العرض.";
  });
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
