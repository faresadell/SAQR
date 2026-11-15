"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { formatDateTime } from "@/lib/format";
import { setReviewHiddenAction } from "./actions";

const idle: FormState = {};

export interface AdminReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  isHidden: boolean;
  createdAt: Date;
  customerName: string;
  merchantName: string;
}

function ReviewRow({ r }: { r: AdminReviewRow }) {
  const [state, action, pending] = useActionState(setReviewHiddenAction, idle);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{r.merchantName} <span className="text-xs font-normal text-ink-muted">— {r.customerName}</span></h3>
        <span className="flex items-center gap-2">
          <span className="num text-warning" aria-label={`${r.rating} من 5`}>{"★".repeat(r.rating)}</span>
          {r.isHidden ? <Badge tone="warning">مخفي</Badge> : null}
        </span>
      </div>
      {r.comment ? <p className="text-sm">{r.comment}</p> : null}
      <p className="num text-xs text-ink-muted">{formatDateTime(r.createdAt)}</p>
      <form action={action} className="border-t border-line pt-2">
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="hidden" value={r.isHidden ? "0" : "1"} />
        <Button type="submit" variant={r.isHidden ? "secondary" : "danger"} loading={pending}>{r.isHidden ? "إظهار التقييم" : "إخفاء التقييم"}</Button>
      </form>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
    </Card>
  );
}

export function ReviewsPanel({ rows }: { rows: AdminReviewRow[] }) {
  if (rows.length === 0) return <EmptyState icon="star" title="لا توجد تقييمات بعد" />;
  return <div className="flex flex-col gap-3">{rows.map((r) => <ReviewRow key={r.id} r={r} />)}</div>;
}
