"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
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
      {state.error ? <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm font-medium text-danger-ink">{state.error}</p> : null}
      <Button type="submit" loading={pending}>دخول</Button>
    </form>
  );
}
