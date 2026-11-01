import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadDriverPackage } from "@/features/driver/data";
import { purchasePlanAction } from "@/features/shared/actions";
import { PackagesView } from "@/features/shared/packages-view";
import { ResultState } from "@/features/shared/result-state";
import { StarsView } from "@/features/shared/shared-views";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الباقة والنجوم" };

export default async function DriverPackagePage() {
  const { user } = await requireRole("DRIVER");
  const result = await loadDriverPackage(user);
  return (
    <>
      <PageHeader title="الباقة والنجوم" description="لا تُخصم نجوم على الطلبات أو الرحلات." />
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
