import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadMerchantReport } from "@/features/merchant/data";
import { MerchantReportView } from "@/features/merchant/views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "المدفوعات والتقارير" };

export default async function MerchantReportsPage() {
  const { user } = await requireRole("MERCHANT");
  const result = await loadMerchantReport(user);
  return (
    <>
      <PageHeader title="المدفوعات والتقارير" description="المبيعات والعمولات والتسويات." />
      {result.status === "ready" ? <MerchantReportView data={result.data} /> : <ResultState result={result} />}
    </>
  );
}
