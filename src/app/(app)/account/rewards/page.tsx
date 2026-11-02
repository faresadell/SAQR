import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadRewards } from "@/features/customer/data";
import { RewardsView } from "@/features/customer/views";
import { ResultState } from "@/features/shared/result-state";
import { AwardsList } from "@/features/customer/awards-list";
import { listMyAwards } from "@/server/contest/service";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "المكافآت الشهرية" };

export default async function RewardsPage() {
  const { user } = await requireRole("CUSTOMER");
  const [result, awards] = await Promise.all([loadRewards(user), listMyAwards(user).catch(() => [])]);
  return (
    <>
      <PageHeader title="المكافآت الشهرية" description="كلما أكملت طلبات أكثر هذا الشهر زادت مكافأتك." />
      {result.status === "ready" ? <RewardsView data={result.data} /> : <ResultState result={result} />}
      <AwardsList awards={awards.map((a) => ({ monthKey: a.monthKey, rank: a.rank, prizeCents: a.prizeCents, status: a.status, paidAt: a.paidAt ? a.paidAt.toISOString() : null }))} />
    </>
  );
}
