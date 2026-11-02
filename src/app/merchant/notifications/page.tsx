import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadMerchantNotifications } from "@/features/merchant/data";
import { ResultState } from "@/features/shared/result-state";
import { NotificationsView } from "@/features/shared/shared-views";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الإشعارات والدعم" };

export default async function MerchantNotificationsPage() {
  const { user } = await requireRole("MERCHANT");
  const result = await loadMerchantNotifications(user);
  return (
    <>
      <PageHeader title="الإشعارات والدعم" description="قناة الدعم لم تُفعَّل بعد." />
      {result.status === "ready" ? <NotificationsView items={result.data} /> : <ResultState result={result} />}
    </>
  );
}
