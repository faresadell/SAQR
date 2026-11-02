import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadMerchantOffers } from "@/features/merchant/data";
import { MerchantOffersPanel } from "@/features/merchant/offers-panel";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "العروض" };

export default async function MerchantOffersPage() {
  const { user } = await requireRole("MERCHANT");
  const result = await loadMerchantOffers(user);
  return (
    <>
      <PageHeader title="العروض" description="انشر عروضاً لمدة ٢٤ ساعة أو أكثر، وتابع حصتك وسجل العروض." />
      {result.status === "ready" ? <MerchantOffersPanel data={result.data} /> : <ResultState result={result} />}
    </>
  );
}
