"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { FormState } from "@/lib/form-state";
import { createOfferAsAdminAction } from "./actions";

const initial: FormState = {};
const areaClass = "min-h-20 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm";
const selectClass = "h-11 w-full rounded-control border border-line bg-surface px-3 text-sm";

export function AdminOfferForm({ merchantId, products }: { merchantId: string; products: { id: string; nameAr: string; priceCents: number }[] }) {
  const [state, action, pending] = useActionState(createOfferAsAdminAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="merchantId" value={merchantId} />
      <Field label="عنوان العرض" name="title" required maxLength={80} />
      <div className="flex flex-col gap-1">
        <label htmlFor="offer-description" className="text-sm font-semibold">وصف (اختياري)</label>
        <textarea id="offer-description" name="description" maxLength={500} className={areaClass} />
      </div>
      <fieldset className="flex flex-col gap-2 rounded-control border border-line p-3">
        <legend className="px-1 text-sm font-semibold">خصم (اختياري)</legend>
        <p className="text-xs text-ink-muted">يعمل فقط بعد تفعيل الخصومات من الإعدادات العامة، وبحدودها (نسبة وقيمة ثابتة وعدد العروض الجارية). النسبة بالمئة، والثابت بالجنيه للوحدة.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <select name="discountType" defaultValue="" className={selectClass} aria-label="نوع الخصم">
            <option value="">بدون خصم</option>
            <option value="PERCENT">نسبة مئوية</option>
            <option value="FIXED">مبلغ ثابت للوحدة</option>
          </select>
          <Field label="قيمة الخصم" name="discountValue" inputMode="decimal" dir="ltr" error={state.fieldErrors?.discountValue} />
        </div>
        {products.length === 0 ? <p className="text-sm text-ink-muted">لا توجد منتجات متاحة لهذا النشاط.</p> : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {products.map((p) => (
              <li key={p.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="productIds" value={p.id} />{p.nameAr} <span className="num text-ink-muted">({p.priceCents / 100})</span></label></li>
            ))}
          </ul>
        )}
      </fieldset>
      {state.error ? <p role="alert" className="text-sm font-medium text-danger-ink">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-sm font-medium text-success-ink">{state.message}</p> : null}
      <Button type="submit" loading={pending} className="w-fit">نشر العرض نيابةً عن النشاط</Button>
    </form>
  );
}
