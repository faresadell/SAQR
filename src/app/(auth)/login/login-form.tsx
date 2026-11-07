"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { Notice } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { loginAction, type FormState } from "../actions";

const initial: FormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const [mode, setMode] = useState<"email" | "phone">("email");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div role="tablist" aria-label="طريقة الدخول" className="grid grid-cols-2 gap-1 rounded-control bg-canvas p-1">
        {([["email", "الإيميل"], ["phone", "رقم الموبايل"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={cn("h-10 rounded-control text-sm font-bold transition-colors", mode === key ? "bg-surface text-navy-900 shadow-card" : "text-ink-muted hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "email" ? (
        <Field key="email" label="الإيميل" name="identifier" type="email" inputMode="email" autoComplete="username" dir="ltr" placeholder="name@example.com" required />
      ) : (
        <Field key="phone" label="رقم الموبايل" name="identifier" type="tel" inputMode="tel" autoComplete="username" dir="ltr" placeholder="01xxxxxxxxx" required />
      )}
      <PasswordField label="كلمة المرور" name="password" autoComplete="current-password" required />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" loading={pending}>دخول</Button>
      <Link href="/forgot-password" className="text-center text-sm font-semibold text-brand underline">نسيت كلمة المرور؟</Link>
    </form>
  );
}
