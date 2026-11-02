"use server";

import { redirect } from "next/navigation";
import { getClientIp } from "@/lib/client-ip";
import { normalizeEmail } from "@/lib/auth/email";
import { normalizeEgyptPhone } from "@/lib/auth/phone";
import type { PasswordProblem } from "@/lib/auth/password";
import { confirmPasswordResetByEmail, requestPasswordResetByEmail } from "@/server/auth/email-account";
import { confirmPasswordReset, requestPasswordReset } from "@/server/auth/password-reset";
import type { FormState } from "./actions";

const PROBLEMS: Record<PasswordProblem, string> = {
  TOO_SHORT: "كلمة المرور يجب ألا تقل عن 8 أحرف.",
  TOO_LONG: "كلمة المرور طويلة جداً.",
  ALL_DIGITS: "كلمة المرور لا يجب أن تكون أرقاماً فقط.",
  COMMON: "كلمة المرور شائعة وسهلة التخمين.",
  SAME_AS_PHONE: "كلمة المرور لا يجب أن تكون رقم الهاتف.",
  NEEDS_MIX: "كلمة المرور يجب أن تجمع حروفاً مع أرقام أو رموز.",
};
const RATE = "محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.";

const text = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
};

/** Accepts an email or an Egyptian phone. Returns the normalized identifier and which channel it is. */
function identify(raw: string): { kind: "email" | "phone"; value: string } | null {
  if (raw.includes("@")) {
    const email = normalizeEmail(raw);
    return email ? { kind: "email", value: email } : null;
  }
  const phone = normalizeEgyptPhone(raw);
  return phone ? { kind: "phone", value: phone } : null;
}

/** Step 1. The answer is the same whether or not an account exists, so it cannot be used to find registered users. */
export async function requestResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = identify(text(formData, "identifier"));
  if (!id) return { fieldErrors: { identifier: "اكتب رقم موبايل مصرياً صحيحاً أو بريداً إلكترونياً صحيحاً." } };
  const ip = await getClientIp();
  const result = id.kind === "email" ? await requestPasswordResetByEmail(id.value, ip) : await requestPasswordReset(id.value, ip);
  if (!result.ok) return { error: result.error === "RATE_LIMITED" ? RATE : "تعذر إرسال الطلب. راجع البيانات." };
  redirect(`/reset-password?id=${encodeURIComponent(id.value)}`);
}

/** Step 2. Code + new password. Success signs out every device (done by the service). */
export async function confirmResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = identify(text(formData, "identifier"));
  const code = text(formData, "code");
  const password = String(formData.get("newPassword") ?? "");
  if (!id) return { error: "بيانات غير صحيحة. ابدأ من جديد." };
  if (!/^\d{6}$/.test(code)) return { fieldErrors: { code: "الرمز 6 أرقام." } };
  const ip = await getClientIp();
  const result = id.kind === "email" ? await confirmPasswordResetByEmail(id.value, code, password, ip) : await confirmPasswordReset(id.value, code, password, ip);
  if (!result.ok) {
    if (result.error === "RATE_LIMITED") return { error: RATE };
    if (result.error === "WEAK_PASSWORD") return { fieldErrors: { newPassword: (result.problem && PROBLEMS[result.problem]) || "كلمة المرور ضعيفة." } };
    if (result.error === "INVALID_CODE") return { fieldErrors: { code: "الرمز غير صحيح أو انتهت صلاحيته." } };
    return { error: "تعذر تغيير كلمة المرور. راجع البيانات." };
  }
  redirect("/login?reset=1");
}
