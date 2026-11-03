"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { FormState } from "@/lib/form-state";
import { adminProductAction } from "./actions";

const initial: FormState = {};

export interface ShopOption { id: string; name: string }
export interface CategoryChoice { id: string; label: string }

function Feedback({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? <p role="alert" className="text-sm font-medium text-danger-ink">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-sm font-medium text-success-ink">{state.message}</p> : null}
    </>
  );
}

function Fields({ categories, errors, values }: { categories: CategoryChoice[]; errors: Partial<Record<string, string>>; values?: { name: string; description: string; price: string; categoryId: string; isAvailable: boolean } }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="اسم المنتج" name="name" defaultValue={values?.name} required error={errors.name} />
        <Field label="السعر بالجنيه" name="price" inputMode="decimal" dir="ltr" defaultValue={values?.price} required error={errors.price} />
      </div>
      <Select label="التصنيف" name="categoryId" defaultValue={values?.categoryId} required error={errors.categoryId}>
        <option value="">اختر التصنيف</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </Select>
      <Field label="الوصف (اختياري)" name="description" defaultValue={values?.description} error={errors.description} />
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="isAvailable" defaultChecked={values?.isAvailable ?? true} /> متاح للطلب</label>
    </>
  );
}

export function AdminCreateProductForm({ shops, categories }: { shops: ShopOption[]; categories: CategoryChoice[] }) {
  const [state, action, pending] = useActionState(adminProductAction, initial);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="command" value="create" />
      <Select label="النشاط" name="merchantId" required error={errors.merchantId}>
        <option value="">اختر النشاط</option>
        {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      <Fields categories={categories} errors={errors} />
      <Feedback state={state} />
      <Button type="submit" size="sm" loading={pending}>إضافة المنتج</Button>
    </form>
  );
}

export function AdminProductRow({ p, categories }: { p: { id: string; name: string; description: string; price: string; categoryId: string; isAvailable: boolean; archived: boolean }; categories: CategoryChoice[] }) {
  const [state, action, pending] = useActionState(adminProductAction, initial);
  const errors = state.fieldErrors ?? {};
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="productId" value={p.id} />
        {p.archived ? (
          <Button type="submit" size="sm" variant="secondary" name="command" value="restore" loading={pending}>إعادة المنتج</Button>
        ) : (
          <>
            <Button type="submit" size="sm" variant="ghost" name="command" value={p.isAvailable ? "hide" : "show"} loading={pending}>{p.isAvailable ? "إيقاف الطلب عليه" : "إتاحته للطلب"}</Button>
            <input name="reason" maxLength={300} placeholder="سبب السحب (مطلوب)" aria-label="سبب السحب" className="min-w-40 flex-1 rounded-control border border-line bg-surface px-3 py-1.5 text-sm" />
            <Button type="submit" size="sm" variant="danger" name="command" value="archive" loading={pending}>سحب من الموقع</Button>
          </>
        )}
      </form>
      {errors.reason ? <p role="alert" className="text-sm font-medium text-danger-ink">{errors.reason}</p> : null}
      <Feedback state={state} />
      {p.archived ? null : (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-brand">تعديل البيانات والسعر</summary>
          <EditForm p={p} categories={categories} />
        </details>
      )}
    </div>
  );
}

function EditForm({ p, categories }: { p: { id: string; name: string; description: string; price: string; categoryId: string; isAvailable: boolean }; categories: CategoryChoice[] }) {
  const [state, action, pending] = useActionState(adminProductAction, initial);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="command" value="update" />
      <input type="hidden" name="productId" value={p.id} />
      <Fields categories={categories} errors={errors} values={p} />
      <Feedback state={state} />
      <Button type="submit" size="sm" variant="secondary" loading={pending}>حفظ التعديل</Button>
    </form>
  );
}
