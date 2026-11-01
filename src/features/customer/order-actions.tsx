"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FileUpload } from "@/components/ui/file-upload";
import { Notice } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/form-state";
import { formatEgp } from "@/lib/money";
import { cancelOrderAction, payOrderAction } from "./actions";

export interface PayMethod {
  code: string;
  label: string;
  receiverNumber: string | null;
}

const idle: FormState = {};

/** Transfer to the shop, then send the receipt and the transfer number. The shop confirms; this never marks anything paid. */
export function PayForm({ orderId, merchantName, amountCents, methods }: { orderId: string; merchantName: string; amountCents: number; methods: PayMethod[] }) {
  const [state, action, pending] = useActionState(payOrderAction, idle);
  const [method, setMethod] = useState(methods[0]?.code ?? "");
  const chosen = methods.find((m) => m.code === method);
  const errors = state.fieldErrors ?? {};
  if (methods.length === 0) return <Notice tone="warning">لا توجد وسيلة دفع مفعّلة حالياً. حاول لاحقاً.</Notice>;
  return (
    <form action={action} className="flex flex-col gap-3" aria-label={`إرسال إيصال ${merchantName}`}>
      <input type="hidden" name="orderId" value={orderId} />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-sm font-semibold">وسيلة التحويل</legend>
        {methods.map((m) => (
          <label key={m.code} className="flex cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 text-sm font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="radio" name="method" value={m.code} checked={method === m.code} onChange={() => setMethod(m.code)} />
            {m.label}
          </label>
        ))}
      </fieldset>
      <p className="rounded-control bg-canvas p-3 text-sm">
        حوّل <strong className="num">{formatEgp(amountCents)}</strong> للنشاط عبر {chosen?.label ?? "الوسيلة المختارة"}. بيانات استلام النشاط تظهر في صفحته؛ لا تحوّل لرقم غير معلَن.
      </p>
      <Field label="رقم عملية التحويل" name="referenceNo" dir="ltr" required error={errors.referenceNo} />
      <FileUpload label="صورة إيصال هذا النشاط" name="receipt" required error={errors.receipt} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
      <Button type="submit" loading={pending}>إرسال الإيصال</Button>
    </form>
  );
}

/** Before the shop accepts, cancelling is immediate; after acceptance the customer can only ask the shop. */
export function CancelControl({ orderId, mode }: { orderId: string; mode: "direct" | "request" }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(cancelOrderAction, idle);
  if (!open) return <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>{mode === "request" ? "طلب إلغاء" : "إلغاء الطلب"}</Button>;
  return (
    <form action={action} className="flex flex-col gap-3 rounded-control border border-line p-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="mode" value={mode} />
      {mode === "request" ? <Notice tone="info">النشاط قبل طلبك بالفعل، لذلك سيُرسل له طلب إلغاء ويقرر هو. تُرد النجوم فقط إذا وافق.</Notice> : null}
      <Textarea label="سبب الإلغاء" name="reason" required error={state.fieldErrors?.reason} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm" loading={pending}>{mode === "request" ? "إرسال الطلب" : "تأكيد الإلغاء"}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>تراجع</Button>
      </div>
    </form>
  );
}
