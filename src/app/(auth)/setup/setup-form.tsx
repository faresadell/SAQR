"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { setupAdminAction, type SetupState } from "./actions";

const initial: SetupState = {};

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAdminAction, initial);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  if (state.done) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success">تم إنشاء المدير. هذه البيانات تظهر مرة واحدة فقط.</Notice>
        <p className="text-sm">افتح تطبيق Google Authenticator واختر «إدخال مفتاح الإعداد»، واكتب اسم الحساب SAQR، ثم الصق هذا المفتاح:</p>
        <code dir="ltr" className="select-all break-all rounded-control bg-canvas p-3 text-sm">{state.done.manualKey}</code>
        <p className="text-sm text-ink-muted">بعد الإضافة سجّل الدخول من صفحة الدخول برقمك وكلمة المرور وكود المصادقة (من قسم «دخول المشرفين»). ثم احذف SETUP_TOKEN من إعدادات الاستضافة واعمل Redeploy.</p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="الكود السري للإعداد (SETUP_TOKEN)" name="token" type="password" autoComplete="off" dir="ltr" required error={state.fieldErrors?.token} />
      <Field label="الاسم" name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required error={state.fieldErrors?.name} />
      <Field label="رقم الموبايل" name="phone" type="tel" inputMode="tel" dir="ltr" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required error={state.fieldErrors?.phone} />
      <Field label="كلمة المرور (12 حرفاً على الأقل)" name="password" type="password" autoComplete="new-password" required error={state.fieldErrors?.password} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" loading={pending}>إنشاء المدير</Button>
    </form>
  );
}
