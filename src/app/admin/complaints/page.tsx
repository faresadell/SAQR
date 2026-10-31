import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadComplaints } from "@/features/admin/data";
import { ComplaintsView } from "@/features/admin/views";
import { ResultState } from "@/features/shared/result-state";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الشكاوى والاستردادات" };

export default async function Page() {
  const { user } = await requirePermission("refunds.verify");
  const result = await loadComplaints(user);
  return (
    <>
      <PageHeader title="الشكاوى والاستردادات" description="تحقق من الاستردادات وتابع الشكاوى." />
      {result.status === "ready" ? <ComplaintsView rows={result.data} /> : <ResultState result={result} />}
    </>
  );
}
