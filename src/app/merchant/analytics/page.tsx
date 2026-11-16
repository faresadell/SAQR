import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { MerchantAnalyticsView } from "@/features/analytics/merchant-view";
import { merchantAnalytics } from "@/server/analytics/merchant";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "تحليلات المتجر" };

export default async function Page() {
  const { user } = await requireRole("MERCHANT");
  const a = await merchantAnalytics(user);
  return (
    <>
      <PageHeader title="تحليلات المتجر" description="مبيعاتك وأكثر منتجاتك طلباً في آخر 30 يوماً." />
      <MerchantAnalyticsView a={a} />
    </>
  );
}
