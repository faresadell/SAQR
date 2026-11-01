"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { Select } from "@/components/ui/select";
import type { FormState } from "@/lib/form-state";
import { formatEgp } from "@/lib/money";
import { addAddressAction } from "./actions";

export interface ZoneOption {
  id: string;
  name: string;
  feeCents: number;
}

const idle: FormState = {};

export function AddressForm({ zones }: { zones: ZoneOption[] }) {
  const [state, action, pending] = useActionState(addAddressAction, idle);
  if (zones.length === 0) return <Notice tone="warning">لا توجد مناطق توصيل متاحة حالياً. لا يمكن إضافة عنوان قبل أن تفعّل الإدارة منطقة.</Notice>;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">إضافة عنوان</h2>
      <form action={action} className="flex flex-col gap-3">
        <Field label="اسم العنوان (اختياري)" name="label" maxLength={40} placeholder="البيت، العمل..." />
        <Field label="العنوان بالتفصيل" name="line" required minLength={5} maxLength={200} error={state.fieldErrors?.line} />
        <Select label="المنطقة" name="zoneId" required defaultValue={zones[0]?.id}>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name} — رسوم التوصيل {formatEgp(z.feeCents)}</option>)}
        </Select>
        {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
        {state.message ? <Notice tone="success">{state.message}</Notice> : null}
        <Button type="submit" loading={pending} className="w-fit">حفظ العنوان</Button>
      </form>
    </Card>
  );
}
