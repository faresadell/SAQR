import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadRewards } from "@/features/customer/data";
import { RewardsView } from "@/features/customer/views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "المكافآت الشهرية" };

export default async function RewardsPage() {
  const { user } = await requireRole("CUSTOMER");
  const result = await loadRewards(user);
  return (
    <>
      <PageHeader title="المكافآت الشهرية" description="كلما أكملت طلبات أكثر هذا الشهر زادت مكافأتك." />
      {result.status === "ready" ? <RewardsView data={result.data} /> : <ResultState result={result} />}
    </>
  );
}
