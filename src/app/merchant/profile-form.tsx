"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { DAY_LABELS_AR, DISPLAY_ORDER, type OpeningHours } from "@/lib/catalog/opening-hours";
import type { FormState } from "@/lib/form-state";
import { saveMerchantAction } from "./actions";

export interface ProfileDefaults {
  name: string;
  description: string;
  businessType: string;
  phone: string;
  address: string;
  lat: string;
  lng: string;
  hours: OpeningHours;
}

const initial: FormState = {};

export function ProfileForm({ defaults, businessTypes, canEdit }: { defaults: ProfileDefaults; businessTypes: { code: string; nameAr: string }[]; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(saveMerchantAction, initial);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <Field label="اسم النشاط" name="name" defaultValue={defaults.name} required error={errors.name} />
        <Select label="نوع النشاط" name="businessType" defaultValue={defaults.businessType} required error={errors.businessType}>
          <option value="" disabled>اختر</option>
          {businessTypes.map((t) => (
            <option key={t.code} value={t.code}>{t.nameAr}</option>
          ))}
        </Select>
        <Field label="وصف مختصر (اختياري)" name="description" defaultValue={defaults.description} error={errors.description} />
        <Field label="رقم التواصل (اختياري)" name="phone" type="tel" inputMode="tel" dir="ltr" defaultValue={defaults.phone} error={errors.phone} />
        <Field label="العنوان (اختياري)" name="address" defaultValue={defaults.address} error={errors.address} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="خط العرض (اختياري)" name="lat" inputMode="decimal" dir="ltr" defaultValue={defaults.lat} error={errors.location} />
          <Field label="خط الطول (اختياري)" name="lng" inputMode="decimal" dir="ltr" defaultValue={defaults.lng} />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">ساعات العمل (بتوقيت القاهرة)</p>
          {DISPLAY_ORDER.map((day) => {
            const interval = defaults.hours[day][0];
            return (
              <div key={day} className="grid grid-cols-[5rem_1fr_1fr_auto] items-end gap-2">
                <span className="pb-3 text-sm">{DAY_LABELS_AR[day]}</span>
                <Field label="من" name={`h:${day}:open`} type="time" dir="ltr" defaultValue={interval?.open ?? "09:00"} />
                <Field label="إلى" name={`h:${day}:close`} type="time" dir="ltr" defaultValue={interval?.close === "24:00" ? "23:59" : (interval?.close ?? "22:00")} />
                <label className="flex items-center gap-1 pb-3 text-sm">
                  <input type="checkbox" name={`h:${day}:closed`} defaultChecked={defaults.hours[day].length === 0} />
                  مغلق
                </label>
              </div>
            );
          })}
          {errors.hours ? <p role="alert" className="text-sm font-medium text-danger-ink">{errors.hours}</p> : null}
        </div>
      </fieldset>

      {state.error ? <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm font-medium text-danger-ink">{state.error}</p> : null}
      {state.message ? <p role="status" className="rounded-control bg-success-soft p-3 text-sm font-medium text-success-ink">{state.message}</p> : null}
      {canEdit ? <Button type="submit" loading={pending}>حفظ</Button> : null}
    </form>
  );
}
