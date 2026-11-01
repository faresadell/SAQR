import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadMerchantPackages } from "@/features/merchant/data";
import { purchasePlanAction } from "@/features/shared/actions";
import { PackagesView } from "@/features/shared/packages-view";
import { ResultState } from "@/features/shared/result-state";
import { StarsView } from "@/features/shared/shared-views";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الباقات والنجوم" };

export default async function MerchantPackagesPage() {
  const { user } = await requireRole("MERCHANT");
  const result = await loadMerchantPackages(user);
  return (
    <>
      <PageHeader title="الباقات والنجوم" description="باقتك ورصيدك وسجل الحركات." />
      {result.status === "ready" ? (
        <div className="flex flex-col gap-8">
          <StarsView data={result.data.stars} />
          <PackagesView options={result.data.options} current={result.data.current} instructions={result.data.instructions}  purchaseAction={purchasePlanAction} />
        </div>
      ) : (
        <ResultState result={result} />
      )}
    </>
  );
}
