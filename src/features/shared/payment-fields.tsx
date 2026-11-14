"use client";

import { Field } from "@/components/ui/field";
import { FileUpload } from "@/components/ui/file-upload";
import { Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import type { PaymentInstruction } from "./types";

interface MethodProps {
  instructions: PaymentInstruction[];
  method: string;
  onChange: (code: string) => void;
  disabled: boolean;
}

/** Payment-method radios (shared by package purchase and star top-up). */
export function MethodFieldset({ instructions, method, onChange, disabled }: MethodProps) {
  return (
    <fieldset className="flex flex-wrap gap-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-semibold">وسيلة الدفع</legend>
      {instructions.map((i) => (
        <label key={i.methodCode} className="flex cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-4 py-2.5 text-sm font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
          <input type="radio" name="method" value={i.methodCode} checked={method === i.methodCode} onChange={() => onChange(i.methodCode)} />
          {i.methodLabel}
        </label>
      ))}
    </fieldset>
  );
}

/** Reference number + receipt upload + the form's result notices. */
export function ProofFields({ disabled, state }: { disabled: boolean; state: FormState }) {
  const errors = state.fieldErrors ?? {};
  return (
    <>
      <Field label="رقم عملية التحويل" name="referenceNo" dir="ltr" required disabled={disabled} error={errors.referenceNo} />
      <FileUpload label="صورة الإيصال" name="receipt" required disabled={disabled} error={errors.receipt} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
    </>
  );
}
