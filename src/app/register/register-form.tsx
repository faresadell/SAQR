"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { Notice } from "@/components/ui/states";
import { checkContactTakenAction, registerAction, type FormState } from "../(auth)/actions";
import { Turnstile } from "./turnstile";

const initial: FormState = {};
const TAKEN_PHONE = "رقم الموبايل ده مسجّل قبل كده. سجّل دخولك، أو استخدم رقماً آخر.";
const TAKEN_EMAIL = "الإيميل ده مسجّل قبل كده. سجّل دخولك (أو «نسيت كلمة المرور»)، أو استخدم إيميلاً آخر.";
const isTakenMessage = (m: string | undefined): boolean => Boolean(m && m.includes("مسجّل قبل كده"));
const looksLikePhone = (v: string): boolean => v.replace(/\D/g, "").length >= 10;
const looksLikeEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Live check while typing. `refused` is a value the server already refused on submit. The message goes away as soon as the value changes. */
function useTakenCheck(kind: "phone" | "email", value: string, plausible: (v: string) => boolean, refused: string | null): boolean {
  const [takenValue, setTakenValue] = useState<string | null>(null);
  useEffect(() => {
    const v = value.trim();
    if (!plausible(v)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      checkContactTakenAction(kind, v)
        .then((r) => { if (!cancelled && r.taken) setTakenValue(v); })
        .catch(() => undefined); // the server still refuses a taken value on submit
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [kind, value, plausible]);
  const v = value.trim();
  return v !== "" && (takenValue === v || refused === v);
}

export function RegisterForm({ role, siteKey, nonce }: { role: "CUSTOMER" | "MERCHANT"; siteKey: string | null; nonce?: string }) {
  const [refused, setRefused] = useState<{ phone: string | null; email: string | null }>({ phone: null, email: null });
  const [state, formAction, pending] = useActionState(async (prev: FormState, formData: FormData): Promise<FormState> => {
    const result = await registerAction(prev, formData);
    setRefused({
      phone: isTakenMessage(result.fieldErrors?.phone) ? String(formData.get("phone") ?? "").trim() : null,
      email: isTakenMessage(result.fieldErrors?.email) ? String(formData.get("email") ?? "").trim() : null,
    });
    return result;
  }, initial);
  const errors = state.fieldErrors ?? {};
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const phoneTaken = useTakenCheck("phone", phone, looksLikePhone, refused.phone);
  const emailTaken = useTakenCheck("email", email, looksLikeEmail, refused.email);
  const phoneError = phoneTaken ? TAKEN_PHONE : isTakenMessage(errors.phone) ? undefined : errors.phone;
  const emailError = emailTaken ? TAKEN_EMAIL : isTakenMessage(errors.email) ? undefined : errors.email;
  const blocked = phoneTaken || emailTaken;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="role" value={role} />
      {errors.role ? <p role="alert" className="text-sm font-medium text-danger-ink">{errors.role}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الاسم الأول" name="firstName" autoComplete="given-name" required error={errors.firstName} />
        <Field label="الاسم الثاني" name="lastName" autoComplete="family-name" required error={errors.lastName} />
      </div>
      <Field
        label="رقم الموبايل"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        dir="ltr"
        placeholder="01xxxxxxxxx"
        required
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={phoneError}
      />
      <Field label="البريد الإلكتروني" name="email" type="email" inputMode="email" autoComplete="email" dir="ltr" placeholder="name@example.com" hint="سنرسل إليه رمز تفعيل الحساب." required value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} />
      <PasswordField label="كلمة المرور" name="password" autoComplete="new-password" hint="8 أحرف على الأقل، حروف مع أرقام أو رموز." meter required error={errors.password} />
      <PasswordField label="تأكيد كلمة المرور" name="confirmPassword" autoComplete="new-password" required error={errors.confirmPassword} />

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" className="mt-1" required />
          <span>
            أوافق على <Link href="/legal/terms" className="font-semibold text-brand underline">الشروط والأحكام</Link> و<Link href="/legal/privacy" className="font-semibold text-brand underline">سياسة الخصوصية</Link> ومعالجة بياناتي لتشغيل الخدمة.
          </span>
        </label>
        {errors.consent ? <p role="alert" className="text-sm font-medium text-danger-ink">{errors.consent}</p> : null}
      </div>

      <Turnstile siteKey={siteKey} nonce={nonce} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" size="lg" loading={pending} disabled={blocked}>إنشاء الحساب</Button>
    </form>
  );
}
