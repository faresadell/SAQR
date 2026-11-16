import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SalesView } from "@/features/analytics/sales-view";
import { requireRole } from "@/server/auth/guards";
import { merchantAnalytics } from "@/server/analytics/sales";

export const metadata: Metadata = { title: "تحليلات المبيعات" };

export default async function Page() {
  const { user } = await requireRole("MERCHANT");
  const { sales, rating } = await merchantAnalytics(user);
  return (
    <>
      <PageHeader title="تحليلات المبيعات" description="أداء متجرك في آخر 30 يوماً." />
      <SalesView a={sales} rating={rating} />
    </>
  );
}
