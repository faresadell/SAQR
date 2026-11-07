"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { normalizeEgyptPhone } from "@/lib/auth/phone";
import { checkPasswordStrength, type PasswordProblem } from "@/lib/auth/password";
import { getEnv } from "@/lib/env";
import { normalizeEmail } from "@/lib/auth/email";
import { verifyTurnstile } from "@/lib/security/captcha";
import { authenticate, completeEmailActivation, registerAccount, resendActivationCode } from "@/server/auth/auth-service";
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
  NEEDS_MIX: "كلمة المرور يجب أن تجمع حروفاً مع أرقام أو رموز.",
};

function homeFor(role: string): string {
  if (role === "ADMIN") return "/admin";
  if (role === "MERCHANT") return "/merchant";
  if (role === "DRIVER") return "/driver";
  return "/account";
}

// ───────────── Register ─────────────

const registerSchema = z.object({
  firstName: z.string().trim().min(2, "اكتب الاسم الأول (حرفان على الأقل).").max(40, "الاسم طويل جداً."),
  lastName: z.string().trim().min(2, "اكتب الاسم الثاني (حرفان على الأقل).").max(40, "الاسم طويل جداً."),
  phone: z.string().max(30),
  email: z.string().max(200),
  password: z.string().max(200),
  role: z.enum(["CUSTOMER", "MERCHANT", "DRIVER"], { message: "اختر نوع الحساب." }),
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
  const email = normalizeEmail(parsed.data.email);
  if (!email) return { fieldErrors: { email: "اكتب بريداً إلكترونياً صحيحاً." } };

  const problem = checkPasswordStrength(parsed.data.password, phone);
  if (problem) return { fieldErrors: { password: passwordMessages[problem] } };

  const ip = await getClientIp();
  const env = getEnv();
  if (env.CAPTCHA_PROVIDER === "turnstile") {
    const token = formData.get("cf-turnstile-response");
    if (!(await verifyTurnstile(typeof token === "string" ? token : null, env.TURNSTILE_SECRET_KEY!, ip))) return { error: "تعذر التحقق من أنك لست روبوتاً. أعد المحاولة." };
  }

  const result = await registerAccount({ name: `${parsed.data.firstName} ${parsed.data.lastName}`, phone, email, password: parsed.data.password, role: parsed.data.role }, ip);
  if (!result.ok) return { error: result.error === "RATE_LIMITED" ? RATE_LIMITED : "تعذر إرسال رمز التفعيل إلى بريدك. حاول لاحقاً." };

  await setPendingPhone(phone);
  redirect("/verify");
}

// ───────────── Activate by email code ─────────────

export async function verifyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const phone = await getPendingPhone();
  if (!phone) redirect("/register");

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { fieldErrors: { code: "اكتب الرمز المكوّن من 6 أرقام." } };

  const ip = await getClientIp();
  const result = await completeEmailActivation(phone, code, ip);
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
  const result = await resendActivationCode(phone, await getClientIp());
  if (!result.ok) return { error: RATE_LIMITED };
  // Same neutral message even when the cooldown suppressed sending.
  return { message: "إذا كان الحساب بانتظار التفعيل سيصلك رمز جديد على بريدك خلال لحظات." };
}

// ───────────── Login / logout ─────────────

const loginSchema = z.object({
  identifier: z.string().max(200),
  password: z.string().min(1, "اكتب كلمة المرور.").max(200),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "اكتب الإيميل وكلمة المرور." };

  // The normal way in is the email. A phone number still works for accounts that have no email (e.g. drivers added by a shop).
  const raw = parsed.data.identifier.trim();
  const email = raw.includes("@") ? normalizeEmail(raw) : null;
  const phone = raw.includes("@") ? null : normalizeEgyptPhone(raw);
  const ip = await getClientIp();
  const invalid: FormState = { error: "الإيميل أو كلمة المرور غير صحيحة." };
  if (!email && !phone) return invalid;

  const result = await authenticate({ ...(email ? { email } : { phone: phone! }), password: parsed.data.password }, ip);
  if (!result.ok) {
    switch (result.error) {
      case "RATE_LIMITED":
        return { error: RATE_LIMITED };
      case "SUSPENDED":
        return { error: "هذا الحساب موقوف. تواصل مع الدعم." };
      case "NEEDS_VERIFICATION":
        await setPendingPhone(result.phone);
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
