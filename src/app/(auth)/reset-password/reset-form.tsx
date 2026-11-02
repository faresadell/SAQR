"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import type { FormState } from "../actions";
import { confirmResetAction } from "../reset-actions";

const initial: FormState = {};

export function ResetForm({ identifier }: { identifier: string }) {
  const [state, action, pending] = useActionState(confirmResetAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="identifier" value={identifier} />
      <Field label="الرمز (6 أرقام)" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" required error={state.fieldErrors?.code} />
      <Field label="كلمة المرور الجديدة" name="newPassword" type="password" autoComplete="new-password" required minLength={8} error={state.fieldErrors?.newPassword} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" loading={pending}>تغيير كلمة المرور</Button>
    </form>
  );
}
