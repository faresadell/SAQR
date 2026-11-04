"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { changePhoneAction } from "./phone-actions";

const idle: FormState = {};

/** Contact number. It is not proven by a code, so it is never used to recover the account. Changing it needs the password. */
export function PhonePanel({ phone }: { phone: string }) {
  const [state, action, pending] = useActionState(changePhoneAction, idle);
  const [next, setNext] = useState(""); // kept when the password is wrong: only the password field is cleared after a submit
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">رقم الموبايل</h2>
        <Badge tone="warning">غير متحقق منه</Badge>
      </div>
      <p className="text-sm text-ink-muted">رقم للتواصل فقط ولا يُستخدم لاستعادة الحساب. الحالي: <span className="ltr-isolate font-semibold">{phone}</span></p>
      <form action={action} className="flex flex-wrap items-end gap-2">
        <Field label="الرقم الجديد" name="phone" type="tel" inputMode="tel" dir="ltr" autoComplete="tel" required value={next} onChange={(e) => setNext(e.target.value)} error={state.fieldErrors?.phone} />
        <Field label="كلمة المرور الحالية" name="password" type="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
        <Button type="submit" variant="outline" loading={pending}>تغيير الرقم</Button>
      </form>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
    </Card>
  );
}
