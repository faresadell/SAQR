import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadMyDeliveries } from "@/features/driver/data";
import { DeliveryList } from "@/features/driver/views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "سجل التوصيل" };

export default async function DriverHistoryPage() {
  const { user } = await requireRole("DRIVER");
  const result = await loadMyDeliveries(user, "HISTORY");
  return (
    <>
      <PageHeader title="سجل التوصيل" />
      {result.status === "ready" ? <DeliveryList rows={result.data} actionable={false} emptyTitle="لا توجد توصيلات سابقة" emptyText="ستظهر توصيلاتك المنتهية هنا." /> : <ResultState result={result} />}
    </>
  );
}
