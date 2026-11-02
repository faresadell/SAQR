import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadPurchaseReviews } from "@/features/admin/data";
import { PurchaseReviewPanel } from "@/features/admin/panels";
import { ResultState } from "@/features/shared/result-state";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "التحويلات والإيصالات" };

export default async function Page() {
  const { user } = await requirePermission("payments.review");
  const result = await loadPurchaseReviews(user);
  return (
    <>
      <PageHeader title="مراجعة طلبات شراء الباقات" description="اعتمد أو ارفض التحويلات اليدوية بعد مراجعة الإيصال. تحويلات الطلبات يؤكدها كل تاجر لنفسه." />
      {result.status === "ready" ? <PurchaseReviewPanel rows={result.data} /> : <ResultState result={result} />}
    </>
  );
}
