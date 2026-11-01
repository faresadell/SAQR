import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { PageHeader } from "@/components/ui/page-header";
import { OffersList } from "@/features/public/offers-list";
import { ResultState } from "@/features/shared/result-state";
import { loadOffers } from "@/features/public/data";

export const metadata: Metadata = { title: "العروض النشطة" };

export default async function OffersPage() {
  const result = await loadOffers();
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader title="العروض النشطة" description="عروض الأنشطة السارية حالياً. تختفي العروض المنتهية تلقائياً." />
        {result.status === "ready" ? <OffersList offers={result.data} /> : <ResultState result={result} />}
      </div>
    </SiteShell>
  );
}
