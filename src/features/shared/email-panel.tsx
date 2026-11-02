"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { confirmEmailAction, startEmailAction } from "./email-actions";

const idle: FormState = {};

/** Optional recovery email. A password reset by email works only after the address is confirmed with a code. */
export function EmailPanel({ email, verified }: { email: string | null; verified: boolean }) {
  const [startState, start, starting] = useActionState(startEmailAction, idle);
  const [confirmState, confirm, confirming] = useActionState(confirmEmailAction, idle);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">البريد الإلكتروني</h2>
        {email ? <Badge tone={verified ? "success" : "warning"}>{verified ? "مؤكَّد" : "غير مؤكَّد"}</Badge> : <Badge>غير مضاف</Badge>}
      </div>
      <p className="text-sm text-ink-muted">اختياري. يساعدك على استعادة كلمة المرور إن فقدت الوصول لرقمك.{email ? <> الحالي: <span className="ltr-isolate font-semibold">{email}</span></> : null}</p>
      <form action={start} className="flex flex-wrap items-end gap-2">
        <Field label={email ? "تغيير البريد" : "أضف بريدك"} name="email" type="email" dir="ltr" autoComplete="email" required />
        <Button type="submit" variant="outline" loading={starting}>إرسال رمز التأكيد</Button>
      </form>
      {startState.error ? <Notice tone="danger">{startState.error}</Notice> : null}
      {startState.message ? <Notice tone="success">{startState.message}</Notice> : null}
      <form action={confirm} className="flex flex-wrap items-end gap-2">
        <Field label="رمز التأكيد" name="code" inputMode="numeric" maxLength={6} dir="ltr" autoComplete="one-time-code" required error={confirmState.fieldErrors?.code} />
        <Button type="submit" loading={confirming}>تأكيد</Button>
      </form>
      {confirmState.error ? <Notice tone="danger">{confirmState.error}</Notice> : null}
      {confirmState.message ? <Notice tone="success">{confirmState.message}</Notice> : null}
    </Card>
  );
}
