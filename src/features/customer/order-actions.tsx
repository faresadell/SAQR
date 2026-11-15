"use client";

import { Fragment, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FileUpload } from "@/components/ui/file-upload";
import { Notice } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/form-state";
import { formatEgp } from "@/lib/money";
import { answerFeeAction, cancelOrderAction, createReviewAction, fileComplaintAction, payOrderAction } from "./actions";

export interface PayAccount {
  id: string;
  methodLabel: string;
  accountValue: string;
  holderName: string | null;
}

const idle: FormState = {};

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          setDone(false); // the number stays visible and selectable
        }
      }}
    >
      {done ? "تم النسخ" : "نسخ الرقم"}
    </Button>
  );
}

/** Pick one of the shop's own accounts, transfer straight to it, then send the receipt. The shop confirms; this never marks anything paid. */
export function PayForm({ orderId, merchantName, amountCents, accounts }: { orderId: string; merchantName: string; amountCents: number; accounts: PayAccount[] }) {
  const [state, action, pending] = useActionState(payOrderAction, idle);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const errors = state.fieldErrors ?? {};
  if (accounts.length === 0) return <Notice tone="warning">النشاط لم يضف حساب دفع بعد. تواصل معه من المحادثات.</Notice>;
  const chosen = accounts.find((x) => x.id === accountId);
  return (
    <form action={action} className="flex flex-col gap-3" aria-label={`إرسال إيصال ${merchantName}`}>
      <input type="hidden" name="orderId" value={orderId} />
      <p className="text-sm font-semibold">1) اختر حساب {merchantName} وحوّل <strong className="num">{formatEgp(amountCents)}</strong></p>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">حساب الدفع</legend>
        {accounts.map((x) => (
          <label key={x.id} className="flex cursor-pointer items-center gap-3 rounded-control border border-line bg-surface p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="radio" name="accountId" value={x.id} checked={accountId === x.id} onChange={() => setAccountId(x.id)} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold">{x.methodLabel}{x.holderName ? ` — ${x.holderName}` : ""}</span>
              <span className="ltr-isolate num select-all text-base font-bold">{x.accountValue}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {chosen ? <CopyButton value={chosen.accountValue} /> : null}
      <p className="text-sm font-semibold">2) ابعت صورة الإيصال ورقم العملية</p>
      <Field label="رقم عملية التحويل" name="referenceNo" dir="ltr" required error={errors.referenceNo} />
      <FileUpload label="صورة إيصال هذا النشاط" name="receipt" required error={errors.receipt} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
      <Button type="submit" loading={pending}>إرسال الإيصال</Button>
    </form>
  );
}

/** Before the shop accepts, cancelling is immediate; after acceptance the customer can only ask the shop. */
/** The driver named a delivery price; the customer agrees (and pays the driver in cash) or sends the order back to the board. */
export function FeeDecision({ orderId, feeCents, driverName }: { orderId: string; feeCents: number; driverName?: string }) {
  const [state, action, pending] = useActionState(answerFeeAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-control border border-brand bg-brand-soft p-3">
      <input type="hidden" name="orderId" value={orderId} />
      <p className="text-sm font-semibold">{driverName ?? "المندوب"} طلب <strong className="num text-lg">{formatEgp(feeCents)}</strong> توصيل. تدفعها له كاش عند الاستلام.</p>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="answer" value="approve" loading={pending}>موافق</Button>
        <Button type="submit" name="answer" value="refuse" variant="outline" disabled={pending}>أرفض وأبحث عن مندوب تاني</Button>
      </div>
    </form>
  );
}

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

/** After delivery: 1-5 stars and an optional comment. One review per sub-order. */
export function ReviewForm({ orderId, shopName }: { orderId: string; shopName: string }) {
  const [state, action, pending] = useActionState(createReviewAction, idle);
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return (
    <form action={action} className="flex flex-col gap-3 rounded-control border border-line p-3" aria-label={`تقييم ${shopName}`}>
      <input type="hidden" name="orderId" value={orderId} />
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">قيّم {shopName}</legend>
        <div className="flex flex-row-reverse justify-end gap-1 [&>input:checked~label]:text-warning" role="radiogroup">
          {[5, 4, 3, 2, 1].map((n) => (
            <Fragment key={n}>
              <input type="radio" id={`rate-${orderId}-${n}`} name="rating" value={n} required className="peer sr-only" aria-label={`${n} من 5`} />
              <label htmlFor={`rate-${orderId}-${n}`} className="cursor-pointer text-3xl leading-none text-line hover:text-warning peer-focus-visible:outline peer-focus-visible:outline-2">★</label>
            </Fragment>
          ))}
        </div>
      </fieldset>
      <Textarea label="تعليق (اختياري)" name="comment" maxLength={500} rows={3} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" loading={pending} className="w-fit">إرسال التقييم</Button>
    </form>
  );
}

/** Complaint about this sub-order. The shop is told and an administrator reviews it. */
export function ComplaintForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(fileComplaintAction, idle);
  return (
    <details className="rounded-control border border-line p-3">
      <summary className="cursor-pointer text-sm font-semibold">تقديم شكوى على هذا الطلب</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="orderId" value={orderId} />
        <Field label="عنوان الشكوى" name="subject" required minLength={3} maxLength={100} />
        <Textarea label="التفاصيل" name="details" required minLength={10} maxLength={1000} rows={4} />
        {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
        {state.message ? <Notice tone="success">{state.message}</Notice> : null}
        <Button type="submit" variant="outline" loading={pending} className="w-fit">إرسال الشكوى</Button>
      </form>
    </details>
  );
}
