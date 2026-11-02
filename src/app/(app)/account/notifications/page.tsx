import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadNotifications } from "@/features/customer/data";
import { ResultState } from "@/features/shared/result-state";
import { NotificationsView } from "@/features/shared/shared-views";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الإشعارات" };

export default async function NotificationsPage() {
  const { user } = await requireRole("CUSTOMER");
  const result = await loadNotifications(user);
  return (
    <>
      <PageHeader title="الإشعارات" />
      {result.status === "ready" ? <NotificationsView items={result.data} /> : <ResultState result={result} />}
    </>
  );
}
