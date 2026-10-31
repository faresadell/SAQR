import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadAdminNotifications } from "@/features/admin/data";
import { ResultState } from "@/features/shared/result-state";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الإشعارات" };

export default async function Page() {
  const { user } = await requirePermission("settings.view");
  const result = await loadAdminNotifications(user);
  return (
    <>
      <PageHeader title="الإشعارات" description="إدارة قوالب الإشعارات وإرسالها." />
      {result.status === "ready" ? null : <ResultState result={result} />}
    </>
  );
}
