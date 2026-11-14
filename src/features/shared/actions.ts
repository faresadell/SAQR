"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/auth/guards";
import { AuthorizationError } from "@/server/errors";
import { uploadPlanReceipt } from "@/server/orders/receipts";
import { requestPlanPurchase, requestStarTopUp } from "@/server/plans/service";
import { DENIED_ERROR, GENERIC_ERROR, PLAN_MESSAGES, UPLOAD_MESSAGES } from "./messages";

/**
 * Plan purchase for customers, merchants and drivers (the service scopes plans to the buyer's role).
 * Sends receipt + transfer reference for admin review. It never activates a plan or grants stars.
 */
export async function purchasePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER", "MERCHANT", "DRIVER");
  const get = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) return { fieldErrors: { receipt: "اختر صورة الإيصال." } };
  try {
    const upload = await uploadPlanReceipt(user, new Uint8Array(await file.arrayBuffer()));
    if (!upload.ok) return { error: UPLOAD_MESSAGES[upload.error] ?? GENERIC_ERROR };
    const result = await requestPlanPurchase(user, { planCode: get("packageId"), method: get("method"), referenceNo: get("referenceNo"), uploadId: upload.uploadId });
    if (!result.ok) return { error: PLAN_MESSAGES[result.error] ?? GENERIC_ERROR };
    for (const base of ["/account", "/merchant", "/driver"]) revalidatePath(base, "layout");
    return { message: "تم إرسال طلب الشراء. الحالة «قيد المراجعة» حتى تعتمد الإدارة الدفع." };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}

/** A merchant tops up loose stars (1 EGP each) with transfer proof; an admin reviews. It never starts or extends a package. */
export async function topUpStarsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  const get = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const stars = Number(get("stars"));
  if (!Number.isInteger(stars) || stars < 1) return { fieldErrors: { stars: "اكتب عدد نجوم صحيحاً (1 على الأقل)." } };
  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) return { fieldErrors: { receipt: "اختر صورة الإيصال." } };
  try {
    const upload = await uploadPlanReceipt(user, new Uint8Array(await file.arrayBuffer()));
    if (!upload.ok) return { error: UPLOAD_MESSAGES[upload.error] ?? GENERIC_ERROR };
    const result = await requestStarTopUp(user, { stars, method: get("method"), referenceNo: get("referenceNo"), uploadId: upload.uploadId });
    if (!result.ok) return { error: result.error === "INVALID_REQUEST" ? "اكتب عدد نجوم صحيحاً (حتى 5000) ورقم عملية صحيح." : (PLAN_MESSAGES[result.error] ?? GENERIC_ERROR) };
    revalidatePath("/merchant", "layout");
    return { message: "تم إرسال طلب شحن النجوم. الحالة «قيد المراجعة» حتى تعتمد الإدارة الدفع." };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}
