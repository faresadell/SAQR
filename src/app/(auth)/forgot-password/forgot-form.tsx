"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import type { FormState } from "../actions";
import { requestResetAction } from "../reset-actions";

const initial: FormState = {};

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestResetAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="رقم الموبايل أو البريد الإلكتروني" name="identifier" dir="ltr" required error={state.fieldErrors?.identifier} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" loading={pending}>إرسال الرمز</Button>
    </form>
  );
}
