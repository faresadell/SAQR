"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { Select } from "@/components/ui/select";
import type { FormState } from "@/lib/form-state";
import { merchantOrderAction } from "./order-actions";
import type { MerchantDriverOption, MerchantOrderRow } from "./types";

const ADVANCE_LABEL = { PREPARING: "بدء التجهيز", READY: "الطلب جاهز", OUT_FOR_DELIVERY: "خرج للتوصيل", DELIVERED: "تم التسليم" } as const;
const idle: FormState = {};

/** The shop's buttons for ONE sub-order. Buttons appear only for steps that fit the order's state; the server re-checks. */
export function OrderControls({ order, drivers }: { order: MerchantOrderRow; drivers: MerchantDriverOption[] }) {
  const [state, action, pending] = useActionState(merchantOrderAction, idle);
  const a = order.actions;
  const needsReason = a.rejectPayment || a.reject || a.cancel || a.resolveCancellation;
  const any = a.confirmPayment || a.approve || a.advanceTo || a.assignDriver || a.cancel || a.resolveCancellation;
  if (!any) return <span className="text-xs text-ink-muted">لا إجراء متاح</span>;
  return (
    <form action={action} className="flex min-w-56 flex-col gap-2">
      <input type="hidden" name="orderId" value={order.id} />
      {needsReason ? (
        <input name="reason" maxLength={300} placeholder="السبب (مطلوب عند الرفض أو الإلغاء)" aria-label="السبب" className="rounded-control border border-line bg-surface px-3 py-2 text-sm" />
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {a.confirmPayment ? <Button size="sm" name="command" value="confirmPayment" loading={pending}>تأكيد استلام التحويل</Button> : null}
        {a.rejectPayment ? <Button size="sm" variant="danger" name="command" value="rejectPayment" loading={pending}>رفض الإيصال</Button> : null}
        {a.approve ? <Button size="sm" name="command" value="approve" loading={pending}>قبول الطلب</Button> : null}
        {a.reject ? <Button size="sm" variant="danger" name="command" value="reject" loading={pending}>رفض الطلب</Button> : null}
        {a.advanceTo ? (
          <>
            <input type="hidden" name="to" value={a.advanceTo} />
            <Button size="sm" name="command" value="advance" loading={pending}>{ADVANCE_LABEL[a.advanceTo]}</Button>
          </>
        ) : null}
        {a.resolveCancellation ? (
          <>
            <Button size="sm" name="command" value="acceptCancellation" loading={pending}>الموافقة على الإلغاء</Button>
            <Button size="sm" variant="outline" name="command" value="declineCancellation" loading={pending}>رفض طلب الإلغاء</Button>
          </>
        ) : null}
        {a.cancel ? <Button size="sm" variant="danger" name="command" value="cancel" loading={pending}>إلغاء الطلب</Button> : null}
      </div>
      {a.assignDriver ? (
        drivers.length === 0 ? (
          <p className="text-xs text-ink-muted">أضف سائقاً من صفحة السائقين لتتمكن من إسناد التوصيل.</p>
        ) : (
          <div className="flex items-end gap-1.5">
            <Select label="السائق" name="driverId" defaultValue={drivers[0]?.id}>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Button size="sm" variant="outline" name="command" value="assignDriver" loading={pending}>إسناد</Button>
          </div>
        )
      ) : null}
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
    </form>
  );
}
