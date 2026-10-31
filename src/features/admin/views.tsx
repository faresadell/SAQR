"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, Notice } from "@/components/ui/states";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/saqr/status-badge";
import { DELIVERY_STATUS, ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS } from "@/features/shared/status";
import type { ReceiptReviewRow } from "@/features/shared/types";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import type { AdminOrderRow, AuditRow, ComplaintRow, PackageAdminRow } from "./types";

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

type Decision = { row: ReceiptReviewRow; kind: "approve" | "reject" };

/** Receipt review. Approve/reject always asks for confirmation; reject needs a reason. Nothing changes without the server. */
export function PaymentsReviewView({ rows, onDecide }: { rows: ReceiptReviewRow[]; onDecide?: (id: string, kind: "approve" | "reject", reason: string) => Promise<void> }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setDecision(null);
    setReason("");
    setError(null);
  }

  async function confirm() {
    if (!decision || !onDecide || busy) return;
    if (decision.kind === "reject" && reason.trim().length < 3) {
      setError("اكتب سبب الرفض (٣ أحرف على الأقل).");
      return;
    }
    setBusy(true);
    try {
      await onDecide(decision.row.id, decision.kind, reason.trim());
      close();
    } catch {
      setError("تعذر تنفيذ العملية. لم يتغير شيء.");
    } finally {
      setBusy(false);
    }
  }

  const stateBadge = { PENDING: <Badge tone="warning">قيد المراجعة</Badge>, APPROVED: <Badge tone="success">معتمد</Badge>, REJECTED: <Badge tone="danger">مرفوض</Badge> } as const;
  const columns: Column<ReceiptReviewRow>[] = [
    { key: "who", header: "صاحب العملية", cell: (r) => r.payerName },
    { key: "why", header: "الغرض", cell: (r) => r.purpose },
    { key: "amt", header: "السعر", numeric: true, cell: (r) => <span className="num font-bold">{formatEgp(r.amountCents)}</span> },
    { key: "m", header: "الوسيلة", cell: (r) => r.methodLabel },
    { key: "ref", header: "رقم التحويل", cell: (r) => (r.referenceNo ? <span className="ltr-isolate num">{r.referenceNo}</span> : "—") },
    { key: "d", header: "التاريخ", cell: (r) => <span className="num">{formatDateTime(r.submittedAt)}</span> },
    { key: "rc", header: "الإيصال", cell: (r) => (r.receiptHref ? <a href={r.receiptHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">عرض</a> : <span className="text-xs text-ink-muted">غير متاح</span>) },
    { key: "st", header: "الحالة", cell: (r) => stateBadge[r.state] },
    {
      key: "act",
      header: "إجراء",
      cell: (r) =>
        r.state === "PENDING" ? (
          <span className="flex flex-wrap justify-end gap-1.5 md:justify-start">
            <Button size="sm" onClick={() => setDecision({ row: r, kind: "approve" })}>اعتماد</Button>
            <Button size="sm" variant="danger" onClick={() => setDecision({ row: r, kind: "reject" })}>رفض</Button>
          </span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <DataTable caption="مراجعة التحويلات" columns={columns} rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon="receipt" title="لا توجد تحويلات للمراجعة" />} />
      <Modal
        open={decision !== null}
        onClose={close}
        title={decision?.kind === "approve" ? "اعتماد التحويل؟" : "رفض التحويل؟"}
        variant="sheet"
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={busy}>إلغاء</Button>
            <Button variant={decision?.kind === "reject" ? "danger" : "primary"} onClick={confirm} loading={busy} disabled={!onDecide}>
              {decision?.kind === "approve" ? "اعتماد" : "رفض"}
            </Button>
          </>
        }
      >
        {decision ? (
          <div className="flex flex-col gap-3">
            <p>{decision.row.payerName} · {decision.row.purpose} · <strong className="num">{formatEgp(decision.row.amountCents)}</strong></p>
            {decision.kind === "reject" ? <Textarea label="سبب الرفض" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required /> : null}
            {!onDecide ? <Notice tone="info">الاعتماد والرفض غير مفعّلين بعد على الخادم.</Notice> : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

const AUDIENCE = { CUSTOMER: "عملاء", MERCHANT: "تجار", DRIVER: "سائقون" } as const;
export function PackagesAdminView({ rows }: { rows: PackageAdminRow[] }) {
  const columns: Column<PackageAdminRow>[] = [
    { key: "a", header: "الفئة", cell: (r) => AUDIENCE[r.audience] },
    { key: "n", header: "الباقة", cell: (r) => <span className="font-bold">{r.name}</span> },
    { key: "p", header: "السعر", numeric: true, cell: (r) => <span className="num">{formatEgp(r.priceCents)}</span> },
    { key: "b", header: "أساسية", numeric: true, cell: (r) => <span className="num">{formatNumber(r.baseStars)}</span> },
    { key: "x", header: "بونص", numeric: true, cell: (r) => <span className="num">{formatNumber(r.bonusStars)}</span> },
    { key: "t", header: "الإجمالي", numeric: true, cell: (r) => <span className="num font-bold">{formatNumber(r.baseStars + r.bonusStars)}</span> },
    { key: "q", header: "حصة العروض", numeric: true, cell: (r) => (typeof r.offerQuota === "number" ? <span className="num">{formatNumber(r.offerQuota)}</span> : "—") },
    { key: "s", header: "الحالة", cell: (r) => <Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "فعّالة" : "متوقفة"}</Badge> },
  ];
  return <DataTable caption="الباقات والأسعار" columns={columns} rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon="star" title="لا توجد باقات" />} />;
}

export function ComplaintsView({ rows }: { rows: ComplaintRow[] }) {
  const columns: Column<ComplaintRow>[] = [
    { key: "o", header: "الطلب", cell: (r) => <span className="num font-bold">#{formatNumber(r.orderNumber)}</span> },
    { key: "k", header: "النوع", cell: (r) => (r.kind === "REFUND" ? "استرداد" : "شكوى") },
    { key: "s", header: "الملخص", cell: (r) => r.summary },
    { key: "a", header: "المبلغ", numeric: true, cell: (r) => (typeof r.amountCents === "number" ? <span className="num">{formatEgp(r.amountCents)}</span> : "—") },
    { key: "due", header: "الموعد النهائي", cell: (r) => (r.dueAt ? <span className="num">{formatDateTime(r.dueAt)}</span> : "—") },
    { key: "st", header: "الحالة", cell: (r) => <StatusBadge status={REFUND_STATUS[r.status]} /> },
  ];
  return <DataTable caption="الشكاوى والاستردادات" columns={columns} rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon="flag" title="لا توجد شكاوى أو استردادات" />} />;
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
