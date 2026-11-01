"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/states";
import { LinkButton } from "@/components/ui/link-button";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/saqr/status-badge";
import type { FormState } from "@/lib/form-state";
import { DELIVERY_STATUS } from "@/features/shared/status";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import { driverDeliveryAction } from "./actions";
import type { DriverDeliveryRow, DriverHomeData } from "./data";

const idle: FormState = {};

function DeliveryCard({ d, actionable }: { d: DriverDeliveryRow; actionable: boolean }) {
  const [state, action, pending] = useActionState(driverDeliveryAction, idle);
  const picked = d.deliveryStatus === "PICKED_UP" || d.deliveryStatus === "OUT_FOR_DELIVERY";
  const status = DELIVERY_STATUS[d.deliveryStatus as keyof typeof DELIVERY_STATUS];
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">طلب <span className="num">#{formatNumber(d.number)}</span> — {d.shop}</h3>
        {status ? <StatusBadge status={status} /> : null}
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-ink-muted">العنوان</dt><dd className="font-semibold">{d.addressLine || "—"}</dd></div>
        <div>
          <dt className="text-ink-muted">العميل</dt>
          <dd className="font-semibold">{d.customerName} · <a className="ltr-isolate num text-brand underline" href={`tel:${d.customerPhone}`}>{d.customerPhone}</a></dd>
        </div>
        <div><dt className="text-ink-muted">رسوم التوصيل المطلوب تحصيلها نقداً</dt><dd className="num font-bold">{formatEgp(d.feeToCollectCents)}</dd></div>
        <div><dt className="text-ink-muted">أُسند في</dt><dd className="num">{formatDateTime(d.assignedAt)}</dd></div>
      </dl>
      {actionable ? (
        <form action={action} className="flex flex-col gap-2 border-t border-line pt-3">
          <input type="hidden" name="orderId" value={d.orderId} />
          {picked ? (
            <>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="feeCollected" value="yes" defaultChecked /> حصّلت رسوم التوصيل نقداً
              </label>
            </>
          ) : null}
          <input name="note" maxLength={300} placeholder={picked ? "ملاحظة (مطلوبة إن لم تُحصَّل الرسوم أو تعذر التسليم)" : "سبب تعذر الاستلام (عند الإبلاغ)"} aria-label="ملاحظة" className="rounded-control border border-line bg-surface px-3 py-2 text-sm" />
          <div className="flex flex-wrap gap-2">
            {picked ? <Button type="submit" name="command" value="deliver" loading={pending}>تم التسليم</Button> : <Button type="submit" name="command" value="pickUp" loading={pending}>استلمت الطلب من النشاط</Button>}
            <Button type="submit" variant="danger" name="command" value="fail" loading={pending}>تعذّر التوصيل</Button>
          </div>
          {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
          {state.message ? <Notice tone="success">{state.message}</Notice> : null}
        </form>
      ) : (
        <p className="text-xs text-ink-muted">{d.deliveredAt ? `سُلّم في ${formatDateTime(d.deliveredAt)} · ` : ""}تحصيل الرسوم: {d.collectionStatus}</p>
      )}
    </Card>
  );
}

export function DeliveryList({ rows, actionable, emptyTitle, emptyText }: { rows: DriverDeliveryRow[]; actionable: boolean; emptyTitle: string; emptyText: string }) {
  if (rows.length === 0) return <EmptyState icon="navigation" title={emptyTitle}>{emptyText}</EmptyState>;
  return <ul className="flex flex-col gap-4">{rows.map((r) => <li key={r.orderId}><DeliveryCard d={r} actionable={actionable} /></li>)}</ul>;
}

export function DriverHomeView({ data, base }: { data: DriverHomeData; base: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="بانتظار الاستلام" icon="list" value={formatNumber(data.waitingPickup)} />
        <StatCard label="في الطريق" icon="navigation" value={formatNumber(data.onTheRoad)} />
        <StatCard label="سلّمتها اليوم" icon="checkCircle" tone="success" value={formatNumber(data.completedToday)} />
        <StatCard label="رصيد النجوم" icon="star" tone="warning" value={formatNumber(data.starsBalance)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <LinkButton href={`${base}/tasks`}>الطلبات المسندة إليّ</LinkButton>
        <LinkButton href={`${base}/trip`} variant="outline">قيد التوصيل</LinkButton>
      </div>
      <p className="text-xs text-ink-muted">النشاط هو من يُسند لك الطلبات. لا تُخصم نجوم من السائق على الطلبات أو الرحلات.</p>
    </div>
  );
}
