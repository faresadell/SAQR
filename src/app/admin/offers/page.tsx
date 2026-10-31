import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadAdminOffers } from "@/features/admin/data";
import { ResultState } from "@/features/shared/result-state";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "إدارة العروض" };

export default async function Page() {
  const { user } = await requirePermission("orders.view");
  const result = await loadAdminOffers(user);
  return (
    <>
      <PageHeader title="إدارة العروض" description="العروض النشطة والمنتهية وإعدادات المدة والتكلفة." />
      {result.status === "ready" ? null : <ResultState result={result} />}
    </>
  );
}
