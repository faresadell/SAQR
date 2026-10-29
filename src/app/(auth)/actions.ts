"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { normalizeEgyptPhone } from "@/lib/auth/phone";
import { checkPasswordStrength, type PasswordProblem } from "@/lib/auth/password";
import { authenticate, completePhoneVerification, registerAccount } from "@/server/auth/auth-service";
import { requestOtp } from "@/server/auth/otp-service";
import {
  clearPendingPhone,
  createSession,
  destroyCurrentSession,
  getPendingPhone,
  setPendingPhone,
} from "@/server/auth/session";

export interface FormState {
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
}

const RATE_LIMITED = "محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.";

const passwordMessages: Record<PasswordProblem, string> = {
  TOO_SHORT: "كلمة المرور يجب ألا تقل عن 8 أحرف.",
  TOO_LONG: "كلمة المرور طويلة جداً.",
  ALL_DIGITS: "كلمة المرور لا يجب أن تكون أرقاماً فقط.",
  COMMON: "كلمة المرور شائعة وسهلة التخمين.",
  SAME_AS_PHONE: "كلمة المرور لا يجب أن تكون رقم الهاتف.",
};

function homeFor(role: string): string {
  if (role === "ADMIN") return "/admin";
  if (role === "MERCHANT") return "/merchant";
  return "/account";
}

// ───────────── Register ─────────────

const registerSchema = z.object({
  name: z.string().trim().min(2, "اكتب اسمك (حرفان على الأقل).").max(80, "الاسم طويل جداً."),
  phone: z.string().max(30),
  password: z.string().max(200),
  role: z.enum(["CUSTOMER", "MERCHANT"], { message: "اختر نوع الحساب." }),
  consent: z.literal("on", { message: "يجب الموافقة على سياسة الخصوصية للمتابعة." }),
});

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }

  const phone = normalizeEgyptPhone(parsed.data.phone);
  if (!phone) return { fieldErrors: { phone: "اكتب رقم موبايل مصري صحيح (مثال: 01012345678)." } };

  const problem = checkPasswordStrength(parsed.data.password, phone);
  if (problem) return { fieldErrors: { password: passwordMessages[problem] } };

  const result = await registerAccount(
    { name: parsed.data.name, phone, password: parsed.data.password, role: parsed.data.role },
    await getClientIp(),
  );
  if (!result.ok) return { error: result.error === "RATE_LIMITED" ? RATE_LIMITED : "تعذر إرسال رمز التحقق. حاول لاحقاً." };

  await setPendingPhone(phone);
  redirect("/verify");
}

// ───────────── Verify phone ─────────────

export async function verifyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const phone = await getPendingPhone();
  if (!phone) redirect("/register");

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { fieldErrors: { code: "اكتب الرمز المكوّن من 6 أرقام." } };

  const ip = await getClientIp();
  const result = await completePhoneVerification(phone, code, ip);
  if (!result.ok) {
    if (result.error === "RATE_LIMITED") return { error: RATE_LIMITED };
    if (result.error === "SUSPENDED") return { error: "هذا الحساب موقوف. تواصل مع الدعم." };
    return { error: "الرمز غير صحيح أو انتهت صلاحيته." };
  }

  await clearPendingPhone();
  await createSession(result.user, ip);
  redirect(homeFor(result.user.role));
}

export async function resendCodeAction(_prev: FormState, _formData: FormData): Promise<FormState> {
  const phone = await getPendingPhone();
  if (!phone) redirect("/register");
  const result = await requestOtp(phone, "SIGNUP", await getClientIp());
  if (!result.ok && result.reason === "RATE_LIMITED") return { error: RATE_LIMITED };
  // Same neutral message even when the cooldown suppressed sending.
  return { message: "إذا كان الرقم صحيحاً سيصلك رمز جديد خلال لحظات." };
}

// ───────────── Login / logout ─────────────

const loginSchema = z.object({
  phone: z.string().max(30),
  password: z.string().min(1, "اكتب كلمة المرور.").max(200),
  totp: z.string().max(10).optional(),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "اكتب رقم الهاتف وكلمة المرور." };

  const phone = normalizeEgyptPhone(parsed.data.phone);
  const ip = await getClientIp();
  const invalid: FormState = { error: "رقم الهاتف أو كلمة المرور غير صحيحة." };
  if (!phone) return invalid;

  const result = await authenticate({ phone, password: parsed.data.password, totp: parsed.data.totp || undefined }, ip);
  if (!result.ok) {
    switch (result.error) {
      case "RATE_LIMITED":
        return { error: RATE_LIMITED };
      case "SUSPENDED":
        return { error: "هذا الحساب موقوف. تواصل مع الدعم." };
      case "NEEDS_VERIFICATION":
        await setPendingPhone(phone);
        redirect("/verify");
      default:
        return invalid;
    }
  }

  await createSession(result.user, ip);
  redirect(homeFor(result.user.role));
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}
