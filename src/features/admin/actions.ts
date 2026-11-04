"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireUser } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { handleComplaint } from "@/server/complaints/service";
import { approveAward, excludeParticipant, markAwardPaid, proposeFromStandings, rejectAward, restoreParticipant } from "@/server/contest/service";
import { stopOffer } from "@/server/offers/service";
import { decidePlanPurchase, updatePlan } from "@/server/plans/service";
import { reviewRefund } from "@/server/refunds/service";
import { ADMIN_MESSAGES, DENIED_ERROR, GENERIC_ERROR, NOT_FOUND_ERROR, PLAN_MESSAGES } from "@/features/shared/messages";

type AnyResult = { ok: true } | { ok: false; error: string };

const get = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
};

/**
 * Each action re-authenticates and hands the signed-in admin to the service, which checks the permission itself
 * (payments.review, refunds.verify, complaints.manage, offers.manage, contest.manage, settings.manage). Nothing is
 * decided here: a missing permission becomes a denied message, never a silent success.
 */
async function run(work: (user: Awaited<ReturnType<typeof requireUser>>["user"]) => Promise<AnyResult>, paths: string[], success: string): Promise<FormState> {
  const { user } = await requireUser();
  try {
    const result = await work(user);
    if (!result.ok) return { error: ADMIN_MESSAGES[result.error] ?? PLAN_MESSAGES[result.error] ?? GENERIC_ERROR };
    for (const p of paths) revalidatePath(p);
    return { message: success };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}

export async function reviewPurchaseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const decision = get(formData, "decision") === "APPROVE" ? "APPROVE" : "REJECT";
  return run((u) => decidePlanPurchase(u, get(formData, "id"), decision, get(formData, "reason")), ["/admin/payments"], decision === "APPROVE" ? "تم اعتماد الدفع وتفعيل الباقة." : "تم رفض الطلب.");
}

export async function reviewRefundAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const decision = get(formData, "decision") === "VERIFY" ? "VERIFY" : "REJECT_PROOF";
  return run((u) => reviewRefund(u, get(formData, "id"), decision, get(formData, "reason")), ["/admin/complaints"], decision === "VERIFY" ? "تم توثيق الرد." : "تم رفض الإثبات وإرجاعه للتاجر.");
}

export async function handleComplaintAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const to = get(formData, "to");
  if (to !== "IN_REVIEW" && to !== "RESOLVED" && to !== "DISMISSED") return { error: ADMIN_MESSAGES.INVALID_REQUEST! };
  return run((u) => handleComplaint(u, get(formData, "id"), to, get(formData, "response")), ["/admin/complaints"], "تم تحديث الشكوى.");
}

export async function updatePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const num = (name: string) => Number(get(formData, name));
  const quota = get(formData, "offerQuota");
  const price = num("priceEgp");
  if (!Number.isFinite(price)) return { error: ADMIN_MESSAGES.INVALID_REQUEST! };
  return run(
    (u) =>
      updatePlan(u, get(formData, "code"), {
        priceCents: Math.round(price * 100),
        baseStars: num("baseStars"),
        bonusStars: num("bonusStars"),
        offerQuota: quota === "" ? null : Number(quota),
        isActive: get(formData, "isActive") === "on",
      }),
    ["/admin/packages"],
    "تم حفظ الباقة. لا يتأثر من اشترى سابقاً.",
  );
}

export async function adminStopOfferAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return run((u) => stopOffer(u, get(formData, "id"), get(formData, "reason")), ["/admin/offers", "/offers"], "تم إيقاف العرض وإبلاغ التاجر.");
}

export async function contestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const month = get(formData, "monthKey");
  const id = get(formData, "id");
  const reason = get(formData, "reason");
  const paths = ["/admin/contest"];
  switch (get(formData, "command")) {
    case "exclude": return run((u) => excludeParticipant(u, month, get(formData, "userId"), reason), paths, "تم استبعاد المشارك.");
    case "restore": return run((u) => restoreParticipant(u, month, get(formData, "userId")), paths, "تمت إعادة المشارك.");
    case "propose": return run((u) => proposeFromStandings(u, month), paths, "تم اقتراح الجوائز للمراجعة.");
    case "approve": return run((u) => approveAward(u, id), paths, "تم اعتماد الجائزة.");
    case "reject": return run((u) => rejectAward(u, id, reason), paths, "تم رفض الجائزة.");
    case "paid": return run((u) => markAwardPaid(u, id, get(formData, "reference")), paths, "تم تسجيل الصرف.");
    default: return { error: ADMIN_MESSAGES.INVALID_REQUEST! };
  }
}
