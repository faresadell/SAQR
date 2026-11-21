"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { addAddressAction } from "./actions";
import { LocationPicker } from "./location-picker";

const idle: FormState = {};

export function AddressForm() {
  const [state, action, pending] = useActionState(addAddressAction, idle);
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">إضافة عنوان</h2>
      <form action={action} className="flex flex-col gap-3">
        <Field label="اسم العنوان (اختياري)" name="label" maxLength={40} placeholder="البيت، العمل..." />
        <Field label="العنوان بالتفصيل" name="line" required minLength={5} maxLength={200} error={state.fieldErrors?.line} />
        <LocationPicker />
        <p className="text-xs text-ink-muted">اكتب عنوانك بالتفصيل وحدد مكانك على الخريطة. السائق هيشوف العنوان والموقع ويبعتلك سعر التوصيل، وانت توافق عليه.</p>
        {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
        {state.message ? <Notice tone="success">{state.message}</Notice> : null}
        <Button type="submit" loading={pending} className="w-fit">حفظ العنوان</Button>
      </form>
    </Card>
  );
}
