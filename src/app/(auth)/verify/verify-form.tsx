"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { resendCodeAction, verifyAction, type FormState } from "../actions";

const initial: FormState = {};

export function VerifyForm() {
  const [state, formAction, pending] = useActionState(verifyAction, initial);
  const [resendState, resend, resending] = useActionState(resendCodeAction, initial);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <Field
          label="رمز التحقق"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          dir="ltr"
          required
          error={state.fieldErrors?.code}
        />
        {state.error ? <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm font-medium text-danger-ink">{state.error}</p> : null}
        <Button type="submit" loading={pending}>تأكيد</Button>
      </form>

      <form action={resend} className="flex flex-col items-center gap-2">
        <Button type="submit" variant="ghost" size="sm" loading={resending}>إعادة إرسال الرمز</Button>
        {resendState.message ? <p role="status" className="text-sm text-ink-muted">{resendState.message}</p> : null}
        {resendState.error ? <p role="alert" className="text-sm font-medium text-danger-ink">{resendState.error}</p> : null}
      </form>
    </div>
  );
}
