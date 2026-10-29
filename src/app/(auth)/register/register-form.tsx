"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { registerAction, type FormState } from "../actions";

const initial: FormState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initial);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">نوع الحساب</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-control border border-line bg-surface p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="radio" name="role" value="CUSTOMER" defaultChecked />
            <span className="font-semibold">عميل</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-control border border-line bg-surface p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="radio" name="role" value="MERCHANT" />
            <span className="font-semibold">تاجر</span>
          </label>
        </div>
        {errors.role ? <p role="alert" className="text-sm font-medium text-danger-ink">{errors.role}</p> : null}
      </fieldset>

      <Field label="الاسم" name="name" autoComplete="name" required error={errors.name} />
      <Field
        label="رقم الموبايل"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        dir="ltr"
        placeholder="01012345678"
        required
        error={errors.phone}
      />
      <Field
        label="كلمة المرور"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="8 أحرف على الأقل، وليست أرقاماً فقط."
        required
        error={errors.password}
      />

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" className="mt-1" required />
          <span>
            أوافق على <Link href="/privacy" className="font-semibold text-brand underline">سياسة الخصوصية</Link> ومعالجة بياناتي لتشغيل الخدمة.
          </span>
        </label>
        {errors.consent ? <p role="alert" className="text-sm font-medium text-danger-ink">{errors.consent}</p> : null}
      </div>

      {state.error ? <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm font-medium text-danger-ink">{state.error}</p> : null}
      <Button type="submit" loading={pending}>إنشاء الحساب</Button>
    </form>
  );
}
