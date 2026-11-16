"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { EmptyState, Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { formatDate, formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import { createCouponAction, setCouponActiveAction } from "./actions";

const idle: FormState = {};

export interface CouponView {
  id: string;
  code: string;
  kind: "PERCENT" | "FIXED";
  value: number;
  scope: "MERCHANT" | "PLATFORM";
  merchantName: string | null;
  expiresAt: string;
  isActive: boolean;
  expired: boolean;
  uses: number;
  discountCents: number;
}

function CreateForm({ platform }: { platform: boolean }) {
  const [state, action, pending] = useActionState(createCouponAction, idle);
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{platform ? "كوبون جديد للمنصة" : "كوبون جديد لمتجرك"}</h2>
      <p className="text-sm text-ink-muted">
        {platform ? "يصلح على كل الأنشطة. الخصم على المنتجات فقط (التوصيل كاش للمندوب)، والمنصة هي التي تتحمل قيمته." : "الخصم على منتجات متجرك فقط، وأنت تتحمله. العميل يحوّل لك المبلغ بعد الخصم."}
      </p>
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <Field label="الكود" name="code" required dir="ltr" maxLength={20} hint="حروف إنجليزية وأرقام (4–20)" />
        <Select label="نوع الخصم" name="kind" defaultValue="PERCENT">
          <option value="PERCENT">نسبة % (حتى 30)</option>
          <option value="FIXED">مبلغ ثابت بالجنيه (حتى 100)</option>
        </Select>
        <Field label="القيمة" name="value" type="number" inputMode="decimal" min={1} step="any" required />
        <Field label="ينتهي في" name="expires" type="date" required />
        <div className="sm:col-span-2 flex flex-col gap-2">
          {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
          {state.message ? <Notice tone="success">{state.message}</Notice> : null}
          <Button type="submit" loading={pending} className="w-fit">إنشاء الكوبون</Button>
        </div>
      </form>
    </Card>
  );
}

function Row({ c, showShop }: { c: CouponView; showShop: boolean }) {
  const [state, action, pending] = useActionState(setCouponActiveAction, idle);
  const live = c.isActive && !c.expired;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold" dir="ltr">{c.code}</h3>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={live ? "success" : "neutral"}>{c.expired ? "منتهي" : c.isActive ? "فعّال" : "متوقف"}</Badge>
          {showShop ? <Badge tone="info">{c.scope === "PLATFORM" ? "المنصة" : (c.merchantName ?? "نشاط")}</Badge> : null}
        </span>
      </div>
      <p className="text-sm">
        خصم <span className="num font-semibold">{c.kind === "PERCENT" ? `${formatNumber(c.value)}%` : formatEgp(c.value)}</span> · ينتهي <span className="num">{formatDate(c.expiresAt)}</span>
      </p>
      <p className="text-sm text-ink-muted">استُخدم في <span className="num">{formatNumber(c.uses)}</span> طلب · إجمالي الخصم <span className="num">{formatEgp(c.discountCents)}</span></p>
      {!c.expired ? (
        <form action={action} className="border-t border-line pt-2">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="active" value={c.isActive ? "0" : "1"} />
          <Button type="submit" variant={c.isActive ? "danger" : "secondary"} loading={pending}>{c.isActive ? "إيقاف" : "تفعيل"}</Button>
        </form>
      ) : null}
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
    </Card>
  );
}

export function CouponsPanel({ rows, platform }: { rows: CouponView[]; platform: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <CreateForm platform={platform} />
      {rows.length === 0 ? <EmptyState icon="tag" title="لا توجد كوبونات بعد" /> : <div className="grid gap-3 lg:grid-cols-2">{rows.map((c) => <Row key={c.id} c={c} showShop={platform} />)}</div>}
    </div>
  );
}
