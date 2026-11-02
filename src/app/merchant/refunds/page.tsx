import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { MerchantRefundsPanel } from "@/features/merchant/refunds-panel";
import { failed, ready } from "@/features/shared/loaded";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";
import { listRefunds } from "@/server/refunds/service";

export const metadata: Metadata = { title: "استرداد المبالغ" };

export default async function MerchantRefundsPage() {
  const { user } = await requireRole("MERCHANT");
  const result = await listRefunds(user)
    .then((rows) => ready(rows.map((r) => ({ id: r.id, orderId: r.orderId, orderNumber: r.order.number, amountCents: r.amountCents, status: r.status as "PENDING" | "UNDER_REVIEW" | "COMPLETED", dueAt: r.dueAt.toISOString(), isOverdue: r.isOverdue, decisionNote: r.decisionNote }))))
    .catch(() => failed("تعذر تحميل الاستردادات. حاول مرة أخرى."));
  return (
    <>
      <PageHeader title="استرداد المبالغ" description="مبالغ مؤكدة يجب ردها للعملاء بعد الإلغاء. المنصة لا تحرّك الأموال." />
      {result.status === "ready" ? <MerchantRefundsPanel rows={result.data} /> : <ResultState result={result} />}
    </>
  );
}
