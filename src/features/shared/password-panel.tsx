"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { changePasswordAction } from "./phone-actions";

const idle: FormState = {};

export function PasswordPanel() {
  const [state, action, pending] = useActionState(changePasswordAction, idle);
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">كلمة المرور</h2>
      <p className="text-sm text-ink-muted">بعد التغيير يُسجَّل خروجك من أي جهاز آخر.</p>
      <form action={action} className="flex flex-col gap-3">
        <Field label="كلمة المرور الحالية" name="current" type="password" autoComplete="current-password" required error={state.fieldErrors?.current} />
        <Field label="كلمة المرور الجديدة" name="next" type="password" autoComplete="new-password" required minLength={8} error={state.fieldErrors?.next} />
        <Field label="تأكيد كلمة المرور الجديدة" name="confirm" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
        <Button type="submit" loading={pending} className="w-full sm:w-auto">تغيير كلمة المرور</Button>
      </form>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
    </Card>
  );
}
