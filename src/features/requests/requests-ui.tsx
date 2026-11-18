"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { acceptQuoteAction, closeRequestAction, createRequestAction, quoteRequestAction } from "./actions";

const idle: FormState = {};

export function NewRequestForm({ merchantId, addresses, chatId }: { merchantId: string; addresses: { id: string; label: string | null; line: string }[]; chatId?: string }) {
  const [state, action, pending] = useActionState(createRequestAction, idle);
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-3">
      <input type="hidden" name="merchantId" value={merchantId} />
      {chatId ? <input type="hidden" name="chatId" value={chatId} /> : null}
      <Textarea label="اكتب طلبك" name="body" required minLength={3} maxLength={1000} rows={5} hint="اكتب ما تريده بكلماتك. سيحدّد النشاط سعراً نهائياً واحداً، ولا يوجد تفاوض على السعر." />
      <Select label="عنوان التوصيل" name="addressId" required defaultValue="">
        <option value="" disabled>اختر العنوان</option>
        {addresses.map((a) => <option key={a.id} value={a.id}>{a.label ? `${a.label} — ${a.line}` : a.line}</option>)}
      </Select>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" loading={pending} className="w-fit">إرسال الطلب</Button>
    </form>
  );
}

export function QuoteForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(quoteRequestAction, idle);
  return (
    <form action={action} className="flex max-w-md flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <Field label="السعر النهائي للمنتجات (جنيه)" name="price" inputMode="decimal" required error={state.fieldErrors?.price} hint="بدون رسوم التوصيل؛ تُضاف تلقائياً. لا يمكن تغيير السعر بعد الإرسال." />
      <Field label="ملاحظة للعميل (اختياري)" name="note" maxLength={300} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
      <Button type="submit" loading={pending} className="w-fit">إرسال السعر</Button>
    </form>
  );
}

/** Accept (customer, once quoted) and cancel / decline buttons. */
export function RequestButtons({ requestId, canAccept, closeLabel }: { requestId: string; canAccept: boolean; closeLabel: string | null }) {
  const [acceptState, accept, accepting] = useActionState(acceptQuoteAction, idle);
  const [closeState, close, closing] = useActionState(closeRequestAction, idle);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canAccept ? (
          <form action={accept}>
            <input type="hidden" name="requestId" value={requestId} />
            <Button type="submit" loading={accepting}>موافق على السعر وإنشاء الطلب</Button>
          </form>
        ) : null}
        {closeLabel ? (
          <form action={close}>
            <input type="hidden" name="requestId" value={requestId} />
            <Button type="submit" variant="outline" loading={closing}>{closeLabel}</Button>
          </form>
        ) : null}
      </div>
      {acceptState.error ? <Notice tone="danger">{acceptState.error}</Notice> : null}
      {closeState.error ? <Notice tone="danger">{closeState.error}</Notice> : null}
    </div>
  );
}
