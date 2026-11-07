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
      <Field label="الإيميل" name="identifier" type="text" inputMode="email" autoComplete="username" dir="ltr" placeholder="name@example.com" hint="السائق المضاف من تاجر بدون إيميل يكتب رقم موبايله هنا." required />
      <Field label="كلمة المرور" name="password" type="password" autoComplete="current-password" required />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" loading={pending}>دخول</Button>
      <Link href="/forgot-password" className="text-center text-sm font-semibold text-brand underline">نسيت كلمة المرور؟</Link>
    </form>
  );
}
