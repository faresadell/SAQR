import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { loadContestAdmin } from "@/features/admin/data";
import { ContestPanel } from "@/features/admin/panels";
import { ResultState } from "@/features/shared/result-state";
import { MONTH_KEY_PATTERN } from "@/lib/settlements/calc";
import { cairoMonthKey } from "@/lib/stars/rules";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "المسابقة الشهرية" };

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { user } = await requirePermission("contest.manage");
  const { month } = await searchParams;
  const monthKey = month && MONTH_KEY_PATTERN.test(month) ? month : cairoMonthKey(new Date());
  const result = await loadContestAdmin(user, monthKey);
  return (
    <>
      <PageHeader title="المسابقة الشهرية" description={`ترتيب شهر ${monthKey}. غيّر الشهر بإضافة ?month=YYYY-MM للرابط.`} />
      {result.status !== "ready" ? <ResultState result={result} /> : result.data ? <ContestPanel data={result.data} /> : <EmptyState icon="star" title="شهر غير صالح" />}
    </>
  );
}
