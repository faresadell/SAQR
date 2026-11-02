"use client";

import { Card } from "@/components/ui/card";
import { BarChart } from "@/components/ui/bar-chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, Notice } from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/saqr/status-badge";
import { DELIVERY_STATUS, ORDER_STATUS, PAYMENT_STATUS } from "@/features/shared/status";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import { formatPercent } from "@/lib/commission";
import { OrderControls } from "./order-controls";
import type { MerchantDriverOption, MerchantOrderRow, MerchantReport } from "./types";

/** Orders table. Action buttons appear only when the server says the merchant may use them. */
export function MerchantOrdersView({ rows, drivers = [] }: { rows: MerchantOrderRow[]; drivers?: MerchantDriverOption[] }) {
  const columns: Column<MerchantOrderRow>[] = [
    { key: "n", header: "الطلب", cell: (r) => <span className="num font-bold">#{formatNumber(r.number)}</span> },
    { key: "d", header: "التاريخ", cell: (r) => <span className="num">{formatDateTime(r.createdAt)}</span> },
    { key: "items", header: "المنتجات", cell: (r) => r.items.map((i) => `${i.name} × ${formatNumber(i.quantity)}`).join("، ") },
    { key: "amt", header: "المبلغ", numeric: true, cell: (r) => <span className="num font-bold">{formatEgp(r.subtotalCents)}</span> },
    {
      key: "pay",
      header: "الدفع",
      cell: (r) => (
        <span className="flex flex-col gap-1">
          <StatusBadge status={PAYMENT_STATUS[r.paymentStatus]} />
          {r.payment ? (
            <span className="text-xs text-ink-muted">
              {r.payment.methodLabel}{r.payment.referenceNo ? <> · رقم العملية <span className="ltr-isolate num">{r.payment.referenceNo}</span></> : null}
              {r.payment.receiptUploadId ? <> · <a className="font-semibold text-brand underline" href={`/api/v1/receipts/${r.payment.receiptUploadId}`} target="_blank" rel="noopener noreferrer">عرض الإيصال</a></> : null}
            </span>
          ) : null}
        </span>
      ),
    },
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
    { key: "act", header: "إجراءات", cell: (r) => <OrderControls order={r} drivers={drivers} /> },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Notice>الأزرار تظهر حسب حالة كل طلب. لا يُقبل الطلب قبل تأكيدك استلام التحويل، وتُخصم النجوم بعد قبولك فقط.</Notice>
      <DataTable caption="طلبات النشاط" columns={columns} rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon="box" title="لا توجد طلبات بعد">ستظهر الطلبات الفرعية الخاصة بنشاطك هنا.</EmptyState>} />
    </div>
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
