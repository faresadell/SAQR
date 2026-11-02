import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadAdminBusinesses } from "@/features/admin/data";
import { ResultState } from "@/features/shared/result-state";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الأنشطة والمنتجات" };

export default async function Page() {
  const { user } = await requirePermission("catalog.manage");
  const result = await loadAdminBusinesses(user);
  return (
    <>
      <PageHeader title="الأنشطة والمنتجات" description="كل الأنشطة ومنتجاتها مع إجراءات الإخفاء والإيقاف." />
      {result.status === "ready" ? null : <ResultState result={result} />}
    </>
  );
}
