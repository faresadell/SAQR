"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { FormState } from "@/lib/form-state";
import { createZoneAction, scheduleZoneFeeAction } from "./actions";

const initial: FormState = {};

export function CreateZoneForm() {
  const [state, formAction, pending] = useActionState(createZoneAction, initial);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="اسم المنطقة" name="name" required error={errors.name} />
      <Field label="رسوم التوصيل (جنيه)" name="fee" inputMode="decimal" dir="ltr" placeholder="30" required error={errors.fee} />
      {state.error ? <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm font-medium text-danger-ink">{state.error}</p> : null}
      {state.message ? <p role="status" className="rounded-control bg-success-soft p-3 text-sm font-medium text-success-ink">{state.message}</p> : null}
      <Button type="submit" loading={pending}>إضافة المنطقة</Button>
    </form>
  );
}

export function ZoneFeeForm({ zoneId }: { zoneId: string }) {
  const [state, formAction, pending] = useActionState(scheduleZoneFeeAction, initial);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="zoneId" value={zoneId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الرسوم الجديدة (جنيه)" name="fee" inputMode="decimal" dir="ltr" required error={errors.fee} />
        <Field label="تاريخ السريان (اختياري)" name="effectiveFrom" type="datetime-local" dir="ltr" error={errors.effectiveFrom} />
      </div>
      {state.error ? <p role="alert" className="text-sm font-medium text-danger-ink">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-sm font-medium text-success-ink">{state.message}</p> : null}
      <Button type="submit" size="sm" variant="secondary" loading={pending}>تسجيل الرسوم</Button>
    </form>
  );
}
