import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadReceiptReviews } from "@/features/admin/data";
import { PaymentsReviewView } from "@/features/admin/views";
import { ResultState } from "@/features/shared/result-state";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "التحويلات والإيصالات" };

export default async function Page() {
  const { user } = await requirePermission("payments.review");
  const result = await loadReceiptReviews(user);
  return (
    <>
      <PageHeader title="مراجعة التحويلات والإيصالات" description="اعتمد أو ارفض التحويلات اليدوية بعد مراجعة الإيصال." />
      {result.status === "ready" ? <PaymentsReviewView rows={result.data} /> : <ResultState result={result} />}
    </>
  );
}
