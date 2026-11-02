"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileUpload } from "@/components/ui/file-upload";
import { EmptyState, Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import { submitRefundProofAction } from "./refund-actions";

export interface MerchantRefundRow {
  id: string;
  orderId: string;
  orderNumber: number;
  amountCents: number;
  status: "PENDING" | "UNDER_REVIEW" | "COMPLETED";
  dueAt: string;
  isOverdue: boolean;
  decisionNote: string | null;
}

const idle: FormState = {};
const LABEL = { PENDING: "بانتظار تحويلك", UNDER_REVIEW: "قيد مراجعة الإدارة", COMPLETED: "تم التوثيق" } as const;

function RefundCard({ r }: { r: MerchantRefundRow }) {
  const [state, action, pending] = useActionState(submitRefundProofAction, idle);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">رد مبلغ الطلب <span className="num">#{formatNumber(r.orderNumber)}</span> — <span className="num">{formatEgp(r.amountCents)}</span></h3>
        <span className="flex gap-1.5">{r.isOverdue ? <Badge tone="danger">متأخر</Badge> : null}<Badge tone={r.status === "COMPLETED" ? "success" : "warning"}>{LABEL[r.status]}</Badge></span>
      </div>
      <p className="text-xs text-ink-muted">حوّل المبلغ للعميل ثم ارفع صورة التحويل قبل <span className="num">{formatDateTime(r.dueAt)}</span>.{r.decisionNote ? ` ملاحظة الإدارة على الإثبات السابق: ${r.decisionNote}` : ""}</p>
      {r.status === "PENDING" ? (
        <form action={action} className="flex flex-col gap-2 border-t border-line pt-2">
          <input type="hidden" name="refundId" value={r.id} />
          <input type="hidden" name="orderId" value={r.orderId} />
          <FileUpload label="صورة تحويل الرد" name="proof" required error={state.fieldErrors?.proof} />
          {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
          {state.message ? <Notice tone="success">{state.message}</Notice> : null}
          <Button type="submit" loading={pending} className="w-fit">إرسال الإثبات</Button>
        </form>
      ) : null}
    </Card>
  );
}

export function MerchantRefundsPanel({ rows }: { rows: MerchantRefundRow[] }) {
  if (rows.length === 0) return <EmptyState icon="receipt" title="لا توجد استردادات" >تظهر هنا المبالغ التي يجب ردها للعملاء بعد إلغاء طلب مدفوع.</EmptyState>;
  return <div className="flex flex-col gap-4">{rows.map((r) => <RefundCard key={r.id} r={r} />)}</div>;
}
