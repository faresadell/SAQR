import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadAudit } from "@/features/admin/data";
import { AuditView } from "@/features/admin/views";
import { ResultState } from "@/features/shared/result-state";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "سجل العمليات" };

export default async function Page() {
  const { user } = await requirePermission("audit.view");
  const result = await loadAudit(user);
  return (
    <>
      <PageHeader title="سجل العمليات" description="كل العمليات الإدارية المسجّلة (للقراءة فقط)." />
      {result.status === "ready" ? <AuditView rows={result.data} /> : <ResultState result={result} />}
    </>
  );
}
