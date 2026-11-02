"use server";

import { revalidatePath } from "next/cache";
import { getClientIp } from "@/lib/client-ip";
import type { FormState } from "@/lib/form-state";
import { confirmEmailVerification, startEmailVerification } from "@/server/auth/email-account";
import { requireUser } from "@/server/auth/guards";
import { GENERIC_ERROR } from "./messages";

const text = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
};

/** Sends a code to the typed address. If the address already belongs to someone else, the answer is the same (nothing leaks). */
export async function startEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  try {
    const result = await startEmailVerification(user, text(formData, "email"), await getClientIp());
    if (!result.ok) {
      const map: Record<string, string> = {
        INVALID_REQUEST: "اكتب بريداً إلكترونياً صحيحاً.",
        RATE_LIMITED: "محاولات كثيرة. حاول لاحقاً.",
        SEND_FAILED: "تعذر إرسال الرسالة الآن. حاول لاحقاً.",
        ALREADY_VERIFIED: "هذا البريد مؤكَّد بالفعل.",
      };
      return { error: map[result.error] ?? GENERIC_ERROR };
    }
    return { message: "إذا كان البريد صحيحاً سيصلك رمز من 6 أرقام خلال لحظات. اكتبه أدناه." };
  } catch (error) {
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}

export async function confirmEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const code = text(formData, "code");
  if (!/^\d{6}$/.test(code)) return { fieldErrors: { code: "الرمز 6 أرقام." } };
  try {
    const result = await confirmEmailVerification(user, code, await getClientIp());
    if (!result.ok) {
      if (result.error === "RATE_LIMITED") return { error: "محاولات كثيرة. حاول لاحقاً." };
      if (result.error === "EMAIL_TAKEN") return { error: "هذا البريد مرتبط بحساب آخر." };
      return { fieldErrors: { code: "الرمز غير صحيح أو انتهت صلاحيته." } };
    }
    for (const base of ["/account", "/merchant", "/driver", "/admin"]) revalidatePath(base, "layout");
    return { message: `تم تأكيد البريد ${result.email}.` };
  } catch (error) {
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}
