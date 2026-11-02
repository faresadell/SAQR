"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import type { FormState } from "@/lib/form-state";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import { boardAction } from "./board-actions";

export interface BoardRow {
  orderId: string;
  number: number;
  shop: string;
  shopAddress: string | null;
  zone: string | null;
  ready: boolean;
  feeCents: number;
  createdAt: string;
}

const idle: FormState = {};

function BoardCard({ row }: { row: BoardRow }) {
  const [state, action, pending] = useActionState(boardAction, idle);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">طلب <span className="num">#{formatNumber(row.number)}</span> — {row.shop}</h3>
        <Badge tone={row.ready ? "success" : "warning"}>{row.ready ? "جاهز للاستلام" : "قيد التجهيز"}</Badge>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-ink-muted">عنوان النشاط</dt><dd className="font-semibold">{row.shopAddress ?? "—"}</dd></div>
        <div><dt className="text-ink-muted">منطقة التوصيل</dt><dd className="font-semibold">{row.zone ?? "—"}</dd></div>
        <div><dt className="text-ink-muted">رسوم التوصيل (تُحصَّل نقداً)</dt><dd className="num font-bold">{formatEgp(row.feeCents)}</dd></div>
      </dl>
      <p className="text-xs text-ink-muted">أُضيف {formatDateTime(row.createdAt)} · بيانات العميل تظهر بعد قبولك الطلب.</p>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="orderId" value={row.orderId} />
        <Button type="submit" name="command" value="claim" loading={pending}>قبول الطلب</Button>
        {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
        {state.message ? <Notice tone="success">{state.message}</Notice> : null}
      </form>
    </Card>
  );
}

/** Refreshes itself so new orders appear and taken ones disappear without a manual reload. */
export function BoardList({ rows }: { rows: BoardRow[] }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(timer);
  }, [router]);
  if (rows.length === 0) return <EmptyState icon="navigation" title="لا توجد طلبات متاحة الآن">تظهر هنا الطلبات التي قبلها النشاط وأُكّد دفعها بانتظار سائق.</EmptyState>;
  return <ul className="flex flex-col gap-4">{rows.map((r) => <li key={r.orderId}><BoardCard row={r} /></li>)}</ul>;
}
