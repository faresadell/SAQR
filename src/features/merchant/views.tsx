"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BarChart } from "@/components/ui/bar-chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, Notice } from "@/components/ui/states";
import { Field } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/saqr/status-badge";
import { DELIVERY_STATUS, ORDER_STATUS, PAYMENT_STATUS } from "@/features/shared/status";
import { formatDate, formatDateTime, formatNumber, starsLabel } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import { formatPercent } from "@/lib/commission";
import type { MerchantOffersData, MerchantOrderRow, MerchantReport } from "./types";

/** Orders table. Action buttons appear only when the server says the merchant may use them. */
export function MerchantOrdersView({ rows }: { rows: MerchantOrderRow[] }) {
  const columns: Column<MerchantOrderRow>[] = [
    { key: "n", header: "الطلب", cell: (r) => <span className="num font-bold">#{formatNumber(r.number)}</span> },
    { key: "d", header: "التاريخ", cell: (r) => <span className="num">{formatDateTime(r.createdAt)}</span> },
    { key: "items", header: "المنتجات", cell: (r) => r.items.map((i) => `${i.name} × ${formatNumber(i.quantity)}`).join("، ") },
    { key: "amt", header: "المبلغ", numeric: true, cell: (r) => <span className="num font-bold">{formatEgp(r.subtotalCents)}</span> },
    { key: "pay", header: "الدفع", cell: (r) => <StatusBadge status={PAYMENT_STATUS[r.paymentStatus]} /> },
    {
      key: "st",
      header: "التجهيز",
      cell: (r) => (
        <span className="flex flex-wrap justify-end gap-1.5 md:justify-start">
          <StatusBadge status={ORDER_STATUS[r.orderStatus]} />
          <StatusBadge status={DELIVERY_STATUS[r.deliveryStatus]} />
        </span>
      ),
    },
    {
      key: "act",
      header: "إجراءات",
      cell: (r) =>
        r.allowed.accept || r.allowed.reject || r.allowed.advance || r.allowed.confirmPayment ? (
          <span className="flex flex-wrap justify-end gap-1.5 md:justify-start">
            {r.allowed.accept ? <Button size="sm" disabled title="الإجراء غير مفعّل بعد على الخادم">قبول</Button> : null}
            {r.allowed.reject ? <Button size="sm" variant="danger" disabled title="الإجراء غير مفعّل بعد على الخادم">رفض</Button> : null}
          </span>
        ) : (
          <span className="text-xs text-ink-muted">لا إجراء متاح</span>
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Notice>أزرار القبول والرفض وتحديث التجهيز تُفعَّل من الخادم حسب حالة كل طلب وصلاحياتك.</Notice>
      <DataTable caption="طلبات النشاط" columns={columns} rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon="box" title="لا توجد طلبات بعد">ستظهر الطلبات الفرعية الخاصة بنشاطك هنا.</EmptyState>} />
    </div>
  );
}

const OFFER_STATE = {
  ACTIVE: { label: "نشط", tone: "success" },
  SCHEDULED: { label: "مجدول", tone: "info" },
  EXPIRED: { label: "منتهٍ", tone: "neutral" },
} as const;

/** Offers: quota, create (not wired yet), and a history that keeps expired offers out of the active list. */
export function MerchantOffersView({ data }: { data: MerchantOffersData }) {
  const [extraHours, setExtraHours] = useState("0");
  const [product, setProduct] = useState(data.products[0]?.id ?? "");
  const remaining = Math.max(0, data.quota.total - data.quota.used);
  const active = data.offers.filter((o) => o.state !== "EXPIRED");
  const expired = data.offers.filter((o) => o.state === "EXPIRED");
  const n = Number(extraHours);
  const valid = extraHours.trim() !== "" && Number.isInteger(n) && n >= 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="المستخدم من الحصة" icon="tag" value={`${formatNumber(data.quota.used)} / ${formatNumber(data.quota.total)}`} note={data.quota.resetsAt ? `تُعاد الحصة ${formatDate(data.quota.resetsAt)}` : undefined} />
        <StatCard label="المتبقي" icon="gift" tone="success" value={formatNumber(remaining)} />
        <Card className="flex flex-col justify-center gap-2">
          <Progress value={data.quota.used} max={Math.max(1, data.quota.total)} label="الحصة المستخدمة" />
          <p className="text-xs text-ink-muted">تُحسب الحصة حسب دورة باقتك.</p>
        </Card>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">نشر عرض جديد</h2>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} aria-label="نشر عرض">
          <Select label="المنتج" value={product} onChange={(e) => setProduct(e.target.value)}>
            {data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Field label="ساعات تمديد إضافية (اختياري)" type="number" inputMode="numeric" min={0} step={1} dir="ltr" value={extraHours} onChange={(e) => setExtraHours(e.target.value)} error={valid ? undefined : "أدخل عدداً صحيحاً من الساعات (٠ أو أكثر)."} />
          <p className="text-sm text-ink-muted sm:col-span-2">
            مدة العرض الأساسية ٢٤ ساعة، وتمديده يكلّف نجمة لكل ساعة إضافية. تكلفة التمديد المطلوب: <strong className="num text-ink">{valid ? <><span dir="ltr">{n}</span> نجمة</> : "—"}</strong> (تقدير للعرض فقط، ويحسب الخادم الخصم النهائي مرة واحدة).
          </p>
          <div className="sm:col-span-2">
            <Notice tone="info">نشر العروض غير مفعّل بعد على الخادم، ولن يُخصم أي رصيد من هذه الصفحة.</Notice>
          </div>
          <Button type="submit" disabled className="sm:col-span-2">نشر العرض</Button>
        </form>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">العروض النشطة</h2>
        {active.length === 0 ? <EmptyState icon="tag" title="لا توجد عروض نشطة" /> : <OfferList offers={active} />}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">سجل العروض المنتهية</h2>
        {expired.length === 0 ? <p className="text-sm text-ink-muted">لا توجد عروض منتهية.</p> : <OfferList offers={expired} />}
      </section>
    </div>
  );
}

function OfferList({ offers }: { offers: MerchantOffersData["offers"] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {offers.map((o) => (
        <li key={o.id}>
          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold">{o.title}</h3>
              <Badge tone={OFFER_STATE[o.state].tone}>{OFFER_STATE[o.state].label}</Badge>
            </div>
            <p className="text-sm text-ink-muted">{o.productName}</p>
            <p className="num text-xs text-ink-muted">من {formatDateTime(o.startsAt)} إلى {formatDateTime(o.endsAt)}</p>
            <p className="text-xs text-ink-muted">التكلفة: {starsLabel(o.starsCost)}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function MerchantReportView({ data }: { data: MerchantReport }) {
  const columns: Column<MerchantReport["rows"][number]>[] = [
    { key: "n", header: "الطلب", cell: (r) => <span className="num font-bold">#{formatNumber(r.orderNumber)}</span> },
    { key: "d", header: "التاريخ", cell: (r) => <span className="num">{formatDate(r.date)}</span> },
    { key: "s", header: "المنتجات", numeric: true, cell: (r) => <span className="num">{formatEgp(r.subtotalCents)}</span> },
    { key: "r", header: "نسبة العمولة (وقت الطلب)", numeric: true, cell: (r) => <span className="num">{formatPercent(r.commissionBp)}%</span> },
    { key: "c", header: "العمولة", numeric: true, cell: (r) => <span className="num font-bold">{formatEgp(r.commissionCents)}</span> },
  ];
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-muted">{data.periodLabel}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="المبيعات" icon="dollar" value={formatEgp(data.salesCents)} />
        <StatCard label="العمولات" icon="percent" tone="warning" value={formatEgp(data.commissionCents)} />
        <StatCard label="صافي التسوية" icon="wallet" tone="success" value={formatEgp(data.settlementCents)} />
      </div>
      <Card><BarChart title="المبيعات الشهرية" data={data.monthly} format={(v) => formatEgp(v)} /></Card>
      <DataTable caption="عمولات الطلبات" columns={columns} rows={data.rows} rowKey={(r) => String(r.orderNumber)} empty={<EmptyState icon="chart" title="لا توجد بيانات بعد" />} />
      <p className="text-xs text-ink-muted">تُعرض نسبة وقيمة العمولة كما سُجّلت وقت كل طلب، ولا تتغير بتغيّر النسب لاحقاً.</p>
    </div>
  );
}
