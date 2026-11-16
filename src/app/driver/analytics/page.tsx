import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { DriverAnalyticsView } from "@/features/analytics/driver-view";
import { requireRole } from "@/server/auth/guards";
import { driverAnalytics } from "@/server/analytics/driver";

export const metadata: Metadata = { title: "أرباحي وأدائي" };

export default async function Page() {
  const { user } = await requireRole("DRIVER");
  const a = await driverAnalytics(user);
  return (
    <>
      <PageHeader title="أرباحي وأدائي" description="توصيلاتك ورسومها في آخر 30 يوماً." />
      <DriverAnalyticsView a={a} />
    </>
  );
}
