"use server";

import { logError } from "@/lib/log";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/auth/guards";
import { AuthorizationError } from "@/server/errors";
import { uploadPlanReceipt } from "@/server/orders/receipts";
import { requestPlanPurchase, requestStarTopUp, type PlanResult } from "@/server/plans/service";
import { DENIED_ERROR, GENERIC_ERROR, PLAN_MESSAGES, UPLOAD_MESSAGES } from "./messages";

type Purchaser = Awaited<ReturnType<typeof requireRole>>["user"];

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/** Shared by package purchase and star top-up: store the receipt, create the review request, report the outcome. */
async function submitWithReceipt(
  user: Purchaser,
  formData: FormData,
  create: (uploadId: string) => Promise<PlanResult<{ purchaseId: string }>>,
  messages: { success: string; invalid?: string },
): Promise<FormState> {
  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) return { fieldErrors: { receipt: "اختر صورة الإيصال." } };
  try {
    const upload = await uploadPlanReceipt(user, new Uint8Array(await file.arrayBuffer()));
    if (!upload.ok) return { error: UPLOAD_MESSAGES[upload.error] ?? GENERIC_ERROR };
    const result = await create(upload.uploadId);
    if (!result.ok) return { error: (result.error === "INVALID_REQUEST" ? messages.invalid : undefined) ?? PLAN_MESSAGES[result.error] ?? GENERIC_ERROR };
    for (const base of ["/account", "/merchant", "/driver"]) revalidatePath(base, "layout");
    return { message: messages.success };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    logError(error);
    return { error: GENERIC_ERROR };
  }
}

/**
 * Plan purchase for customers, merchants and drivers (the service scopes plans to the buyer's role).
 * Sends receipt + transfer reference for admin review. It never activates a plan or grants stars.
 */
export async function purchasePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER", "MERCHANT", "DRIVER");
  return submitWithReceipt(user, formData, (uploadId) => requestPlanPurchase(user, { planCode: field(formData, "packageId"), method: field(formData, "method"), referenceNo: field(formData, "referenceNo"), uploadId }), { success: "تم إرسال طلب الشراء. الحالة «قيد المراجعة» حتى تعتمد الإدارة الدفع." });
}

/** A merchant tops up loose stars (1 EGP each) with transfer proof; an admin reviews. It never starts or extends a package. */
export async function topUpStarsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  const stars = Number(field(formData, "stars"));
  if (!Number.isInteger(stars) || stars < 1) return { fieldErrors: { stars: "اكتب عدد نجوم صحيحاً (1 على الأقل)." } };
  return submitWithReceipt(user, formData, (uploadId) => requestStarTopUp(user, { stars, method: field(formData, "method"), referenceNo: field(formData, "referenceNo"), uploadId }), { success: "تم إرسال طلب شحن النجوم. الحالة «قيد المراجعة» حتى تعتمد الإدارة الدفع.", invalid: "اكتب عدد نجوم صحيحاً (حتى 5000) ورقم عملية صحيح." });
}
