"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { FormState } from "@/lib/form-state";
import { createBusinessTypeAction, createCategoryAction, updateCategoryAction } from "./actions";

const initial: FormState = {};

function Feedback({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? <p role="alert" className="text-sm font-medium text-danger-ink">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-sm font-medium text-success-ink">{state.message}</p> : null}
    </>
  );
}

export function CreateCategoryForm({ parentId }: { parentId?: string }) {
  const [state, formAction, pending] = useActionState(createCategoryAction, initial);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="الاسم العربي" name="nameAr" required error={errors.nameAr} />
        <Field label="الاسم الإنجليزي (اختياري)" name="nameEn" dir="ltr" error={errors.nameEn} />
        <Field label="الترتيب" name="sortOrder" inputMode="numeric" dir="ltr" defaultValue="0" error={errors.sortOrder} />
      </div>
      <Feedback state={state} />
      <Button type="submit" size="sm" loading={pending}>{parentId ? "إضافة تصنيف فرعي" : "إضافة تصنيف"}</Button>
    </form>
  );
}

export function EditCategoryForm({ id, nameAr, nameEn, sortOrder }: { id: string; nameAr: string; nameEn: string; sortOrder: number }) {
  const [state, formAction, pending] = useActionState(updateCategoryAction, initial);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="categoryId" value={id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="الاسم العربي" name="nameAr" defaultValue={nameAr} required error={errors.nameAr} />
        <Field label="الاسم الإنجليزي" name="nameEn" dir="ltr" defaultValue={nameEn} error={errors.nameEn} />
        <Field label="الترتيب" name="sortOrder" inputMode="numeric" dir="ltr" defaultValue={String(sortOrder)} error={errors.sortOrder} />
      </div>
      <Feedback state={state} />
      <Button type="submit" size="sm" variant="secondary" loading={pending}>حفظ</Button>
    </form>
  );
}

export function CreateBusinessTypeForm() {
  const [state, formAction, pending] = useActionState(createBusinessTypeAction, initial);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الرمز (إنجليزي صغير)" name="code" dir="ltr" placeholder="pharmacy" required error={errors.code} />
        <Field label="الاسم العربي" name="nameAr" required error={errors.nameAr} />
      </div>
      <Feedback state={state} />
      <Button type="submit" size="sm" loading={pending}>إضافة نوع نشاط</Button>
    </form>
  );
}
