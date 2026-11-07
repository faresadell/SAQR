"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { Notice } from "@/components/ui/states";
import { registerAction, type FormState } from "../(auth)/actions";
import { Turnstile } from "./turnstile";

const initial: FormState = {};

export function RegisterForm({ role, siteKey, nonce }: { role: "CUSTOMER" | "MERCHANT" | "DRIVER"; siteKey: string | null; nonce?: string }) {
  const [state, formAction, pending] = useActionState(registerAction, initial);
  const errors = state.fieldErrors ?? {};

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
        error={errors.phone}
      />
      <Field label="البريد الإلكتروني" name="email" type="email" inputMode="email" autoComplete="email" dir="ltr" placeholder="name@example.com" hint="سنرسل إليه رمز تفعيل الحساب." required error={errors.email} />
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
      <Button type="submit" size="lg" loading={pending}>إنشاء الحساب</Button>
    </form>
  );
}
