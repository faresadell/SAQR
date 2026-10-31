import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadPackageAdmin } from "@/features/admin/data";
import { PackagesAdminView } from "@/features/admin/views";
import { ResultState } from "@/features/shared/result-state";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الباقات والأسعار" };

export default async function Page() {
  const { user } = await requirePermission("settings.view");
  const result = await loadPackageAdmin(user);
  return (
    <>
      <PageHeader title="الباقات والأسعار والبونص" description="باقات العملاء والتجار والسائقين." />
      {result.status === "ready" ? <PackagesAdminView rows={result.data} /> : <ResultState result={result} />}
    </>
  );
}
