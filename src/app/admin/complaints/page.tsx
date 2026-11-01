import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadComplaintsAdmin } from "@/features/admin/data";
import { ComplaintsPanel } from "@/features/admin/panels";
import { ResultState } from "@/features/shared/result-state";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الشكاوى والاستردادات" };

export default async function Page() {
  const { user } = await requirePermission("refunds.verify");
  const result = await loadComplaintsAdmin(user);
  return (
    <>
      <PageHeader title="الشكاوى والاستردادات" description="تحقق من الاستردادات وتابع الشكاوى." />
      {result.status === "ready" ? <ComplaintsPanel data={result.data} /> : <ResultState result={result} />}
    </>
  );
}
