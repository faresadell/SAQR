import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadStars } from "@/features/customer/data";
import { ResultState } from "@/features/shared/result-state";
import { StarsView } from "@/features/shared/shared-views";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "النجوم" };

export default async function StarsPage() {
  const { user } = await requireRole("CUSTOMER");
  const result = await loadStars(user);
  return (
    <>
      <PageHeader title="النجوم" description="رصيدك وسجل كل الحركات." />
      {result.status === "ready" ? <StarsView data={result.data} /> : <ResultState result={result} />}
    </>
  );
}
