"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { setupAdminAction, type SetupState } from "./actions";

const initial: SetupState = {};

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAdminAction, initial);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  if (state.done) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success">تم إنشاء المدير.</Notice>
        <p className="text-sm text-ink-muted">سجّل الدخول من صفحة الدخول بإيميلك وكلمة المرور. بعدها احذف SETUP_TOKEN من إعدادات الاستضافة واعمل Redeploy.</p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="الكود السري للإعداد (SETUP_TOKEN)" name="token" type="password" autoComplete="off" dir="ltr" required error={state.fieldErrors?.token} />
      <Field label="الاسم" name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required error={state.fieldErrors?.name} />
      <Field label="الإيميل (للدخول)" name="email" type="email" inputMode="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required error={state.fieldErrors?.email} />
      <Field label="رقم الموبايل" name="phone" type="tel" inputMode="tel" dir="ltr" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required error={state.fieldErrors?.phone} />
      <Field label="كلمة المرور (12 حرفاً على الأقل)" name="password" type="password" autoComplete="new-password" required error={state.fieldErrors?.password} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" loading={pending}>إنشاء المدير</Button>
    </form>
  );
}
