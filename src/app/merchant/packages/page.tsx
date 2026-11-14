import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadMerchantPackages } from "@/features/merchant/data";
import { TopUpPanel } from "@/features/merchant/top-up-panel";
import { purchasePlanAction, topUpStarsAction } from "@/features/shared/actions";
import { PackagesView } from "@/features/shared/packages-view";
import { ResultState } from "@/features/shared/result-state";
import { StarsView } from "@/features/shared/shared-views";
import { requireRole } from "@/server/auth/guards";
import { hasEverHadPackage } from "@/server/plans/service";

export const metadata: Metadata = { title: "الباقات والنجوم" };

export default async function MerchantPackagesPage() {
  const { user } = await requireRole("MERCHANT");
  const [result, hadPackage] = await Promise.all([loadMerchantPackages(user), hasEverHadPackage(user.id)]);
  return (
    <>
      <PageHeader title="الباقات والنجوم" description="باقتك ورصيدك وسجل الحركات." />
      {result.status === "ready" ? (
        <div className="flex flex-col gap-8">
          <StarsView data={result.data.stars} />
          <PackagesView options={result.data.options} current={result.data.current} instructions={result.data.instructions}  purchaseAction={purchasePlanAction} />
          {hadPackage && result.data.current.state !== "ACTIVE" ? <TopUpPanel instructions={result.data.instructions} action={topUpStarsAction} blocked={result.data.current.state === "PENDING_REVIEW"} /> : null}
        </div>
      ) : (
        <ResultState result={result} />
      )}
    </>
  );
}
