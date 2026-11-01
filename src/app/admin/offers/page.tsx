import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadAdminOffers } from "@/features/admin/data";
import { OffersAdminPanel } from "@/features/admin/panels";
import { ResultState } from "@/features/shared/result-state";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "إدارة العروض" };

export default async function Page() {
  const { user } = await requirePermission("offers.manage");
  const result = await loadAdminOffers(user);
  return (
    <>
      <PageHeader title="إدارة العروض" description="العروض الجارية والمنتهية، وإيقاف أي عرض مخالف." />
      {result.status === "ready" ? <OffersAdminPanel rows={result.data} /> : <ResultState result={result} />}
    </>
  );
}
