"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { changeNameAction } from "./phone-actions";

const idle: FormState = {};

/** Edit the display name (shown to shops and drivers on orders). */
export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(changeNameAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="الاسم" name="name" defaultValue={name} required maxLength={60} autoComplete="name" error={state.fieldErrors?.name} />
        <Button type="submit" variant="outline" loading={pending}>حفظ الاسم</Button>
      </div>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
    </form>
  );
}
