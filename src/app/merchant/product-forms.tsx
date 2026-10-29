"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { FormState } from "@/lib/form-state";
import { createProductAction, updateProductAction } from "./actions";

export interface ProductDefaults {
  id?: string;
  name: string;
  description: string;
  price: string; // EGP text, e.g. "85.5"
  categoryId: string;
  isAvailable: boolean;
}

const initial: FormState = {};

export function ProductForm({ categories, defaults, mode }: { categories: { id: string; label: string }[]; defaults: ProductDefaults; mode: "create" | "edit" }) {
  const [state, formAction, pending] = useActionState(mode === "create" ? createProductAction : updateProductAction, initial);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {defaults.id ? <input type="hidden" name="productId" value={defaults.id} /> : null}
      <Field label="اسم المنتج" name="name" defaultValue={defaults.name} required error={errors.name} />
      <Field label="الوصف (اختياري)" name="description" defaultValue={defaults.description} error={errors.description} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="السعر (جنيه)" name="price" inputMode="decimal" dir="ltr" defaultValue={defaults.price} required error={errors.price} />
        <Select label="التصنيف" name="categoryId" defaultValue={defaults.categoryId} required error={errors.categoryId}>
          <option value="" disabled>اختر</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isAvailable" defaultChecked={defaults.isAvailable} />
        متاح للطلب
      </label>
      {state.error ? <p role="alert" className="text-sm font-medium text-danger-ink">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-sm font-medium text-success-ink">{state.message}</p> : null}
      <Button type="submit" size="sm" loading={pending}>{mode === "create" ? "إضافة المنتج" : "حفظ التعديل"}</Button>
    </form>
  );
}
