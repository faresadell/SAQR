"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { TIER_LABELS_AR } from "@/lib/commission";
import type { FormState } from "@/lib/form-state";
import { scheduleCommissionAction } from "./actions";

const initial: FormState = {};

export function CommissionForm() {
  const [state, formAction, pending] = useActionState(scheduleCommissionAction, initial);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Select label="عضوية التاجر" name="tier" defaultValue="REGULAR" error={errors.tier}>
        <option value="REGULAR">{TIER_LABELS_AR.REGULAR}</option>
        <option value="BUSINESS">{TIER_LABELS_AR.BUSINESS}</option>
      </Select>
      <Field label="النسبة الجديدة (%)" name="percent" inputMode="decimal" dir="ltr" placeholder="8" required error={errors.percent} />
      <Field
        label="تاريخ السريان (اختياري، بتوقيت القاهرة)"
        name="effectiveFrom"
        type="datetime-local"
        dir="ltr"
        hint="اتركه فارغاً ليسري فوراً. لا يمكن اختيار تاريخ في الماضي، والطلبات السابقة لا تتغير أبداً."
        error={errors.effectiveFrom}
      />
      {state.error ? <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm font-medium text-danger-ink">{state.error}</p> : null}
      {state.message ? <p role="status" className="rounded-control bg-success-soft p-3 text-sm font-medium text-success-ink">{state.message}</p> : null}
      <Button type="submit" loading={pending}>جدولة النسبة</Button>
    </form>
  );
}
