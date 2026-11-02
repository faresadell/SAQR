import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadPackageAdmin } from "@/features/admin/data";
import { PackagesAdminPanel } from "@/features/admin/panels";
import { ResultState } from "@/features/shared/result-state";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الباقات والأسعار" };

export default async function Page() {
  const { user } = await requirePermission("settings.view");
  const result = await loadPackageAdmin(user);
  return (
    <>
      <PageHeader title="الباقات والأسعار والبونص" description="باقات العملاء والتجار والسائقين." />
      {result.status === "ready" ? <PackagesAdminPanel rows={result.data} canEdit={hasPermission(user, "settings.manage")} /> : <ResultState result={result} />}
    </>
  );
}
