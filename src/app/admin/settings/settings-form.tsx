"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { FormState } from "@/lib/form-state";
import { saveSettingsAction } from "./actions";

export interface SettingFieldView {
  key: string;
  label: string;
  help?: string;
  unit: string;
  min: number;
  max: number;
  current: number | null;
  scheduledText: string[];
}

const initial: FormState = {};

export function SettingsForm({ group, fields, canEdit }: { group: "orders" | "security"; fields: SettingFieldView[]; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, initial);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="group" value={group} />
      {fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <Field
            label={`${f.label} (${f.unit})`}
            name={`s:${f.key}`}
            inputMode="numeric"
            dir="ltr"
            defaultValue={f.current ?? ""}
            disabled={!canEdit}
            hint={[f.help, `من ${f.min} إلى ${f.max}`].filter(Boolean).join(" · ")}
            error={errors[f.key]}
          />
          {f.scheduledText.map((text) => (
            <p key={text} className="text-sm text-warning-ink">{text}</p>
          ))}
        </div>
      ))}
      {canEdit ? (
        <>
          <Field
            label="تاريخ السريان (اختياري، بتوقيت القاهرة)"
            name="effectiveFrom"
            type="datetime-local"
            dir="ltr"
            hint="اتركه فارغاً ليسري التغيير فوراً. لا يمكن اختيار تاريخ في الماضي."
            error={errors.effectiveFrom}
          />
          {state.error ? <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm font-medium text-danger-ink">{state.error}</p> : null}
          {state.message ? <p role="status" className="rounded-control bg-success-soft p-3 text-sm font-medium text-success-ink">{state.message}</p> : null}
          <Button type="submit" loading={pending}>حفظ التغييرات</Button>
        </>
      ) : (
        <p className="text-sm text-ink-muted">للعرض فقط: لا تملك صلاحية التعديل.</p>
      )}
    </form>
  );
}
