"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/saqr/status-badge";
import { DELIVERY_STATUS, ORDER_STATUS, PAYMENT_STATUS } from "@/features/shared/status";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import type { AdminOrderRow, AuditRow } from "./types";

export function AdminOrdersView({ rows }: { rows: AdminOrderRow[] }) {
  const columns: Column<AdminOrderRow>[] = [
    { key: "n", header: "الطلب", cell: (r) => <span className="num font-bold">#{formatNumber(r.number)}</span> },
    { key: "d", header: "التاريخ", cell: (r) => <span className="num">{formatDateTime(r.createdAt)}</span> },
    { key: "c", header: "العميل", cell: (r) => r.customerName },
    { key: "m", header: "النشاط", cell: (r) => r.merchantName },
    { key: "t", header: "الإجمالي", numeric: true, cell: (r) => <span className="num font-bold">{formatEgp(r.totalCents)}</span> },
    { key: "p", header: "الدفع", cell: (r) => <StatusBadge status={PAYMENT_STATUS[r.paymentStatus]} /> },
    { key: "s", header: "الحالة", cell: (r) => <span className="flex flex-wrap justify-end gap-1.5 md:justify-start"><StatusBadge status={ORDER_STATUS[r.orderStatus]} /><StatusBadge status={DELIVERY_STATUS[r.deliveryStatus]} /></span> },
  ];
  return <DataTable caption="الطلبات الفرعية" columns={columns} rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon="box" title="لا توجد طلبات" />} />;
}

export function AuditView({ rows }: { rows: AuditRow[] }) {
  const columns: Column<AuditRow>[] = [
    { key: "d", header: "الوقت", cell: (r) => <span className="num">{formatDateTime(r.createdAt)}</span> },
    { key: "a", header: "المنفّذ", cell: (r) => r.actorName },
    { key: "act", header: "العملية", cell: (r) => <span className="ltr-isolate text-xs font-semibold">{r.action}</span> },
    { key: "e", header: "الكيان", cell: (r) => <span className="ltr-isolate text-xs">{r.entityType} · {r.entityId}</span> },
  ];
  return <DataTable caption="سجل العمليات" columns={columns} rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon="shield" title="لا توجد سجلات" />} />;
}
