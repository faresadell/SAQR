"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { loginAction, type FormState } from "../actions";

const initial: FormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="رقم الموبايل" name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="01012345678" required />
      <Field label="كلمة المرور" name="password" type="password" autoComplete="current-password" required />
      <Field
        label="رمز المصادقة (للمشرفين فقط)"
        name="totp"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        dir="ltr"
        placeholder="123456"
      />
      <details className="rounded-control border border-line p-3 text-sm">
        <summary className="cursor-pointer font-semibold">فقدت جهاز المصادقة؟ (للمشرفين)</summary>
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-ink-muted">استخدم أحد رموز الاسترداد التي حفظتها. كل رمز يُستخدم مرة واحدة، وبعده أنشئ رموزاً جديدة من صفحة الأمان.</p>
          <Field label="رمز استرداد" name="recoveryCode" dir="ltr" autoComplete="off" maxLength={20} placeholder="XXXXX-XXXXX" />
        </div>
      </details>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" loading={pending}>دخول</Button>
      <Link href="/forgot-password" className="text-center text-sm font-semibold text-brand underline">نسيت كلمة المرور؟</Link>
    </form>
  );
}
