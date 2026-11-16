"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { Select } from "@/components/ui/select";
import { ImageField } from "@/features/media/image-field";
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
        <Select label="التصنيف (اختياري)" name="categoryId" defaultValue={defaults.categoryId} error={errors.categoryId}>
          <option value="">بدون تصنيف (أخرى)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </Select>
      </div>
      {mode === "create" ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">صورة المنتج (اختياري)</span>
          <ImageField label="اختيار صورة من الجهاز" />
        </div>
      ) : (
        <Notice tone="info">لتغيير صورة المنتج استخدم خانة الصورة أعلى الصفحة.</Notice>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isAvailable" defaultChecked={defaults.isAvailable} />
        متاح للطلب
      </label>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
      <Button type="submit" size="sm" loading={pending}>{mode === "create" ? "إضافة المنتج" : "حفظ التعديل"}</Button>
    </form>
  );
}
