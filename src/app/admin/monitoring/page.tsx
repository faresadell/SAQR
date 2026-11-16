import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { MonitoringView } from "@/features/analytics/monitoring-view";
import { requirePermission } from "@/server/auth/guards";
import { platformMonitoring } from "@/server/platform/monitoring";

export const metadata: Metadata = { title: "مراقبة المنصة" };

export default async function Page() {
  const { user } = await requirePermission("orders.view");
  const m = await platformMonitoring(user);
  return (
    <>
      <PageHeader title="مراقبة المنصة" description="ما يحتاج متابعة الآن وأرقام آخر 30 يوماً." />
      <MonitoringView m={m} />
    </>
  );
}
