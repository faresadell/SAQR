import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadMyDeliveries } from "@/features/driver/data";
import { DeliveryList } from "@/features/driver/views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "قيد التوصيل" };

export default async function DriverTripPage() {
  const { user } = await requireRole("DRIVER");
  const result = await loadMyDeliveries(user, "ACTIVE");
  return (
    <>
      <PageHeader title="قيد التوصيل" description="طلبات استلمتها وفي الطريق للعميل." />
      {result.status === "ready" ? (
        <DeliveryList rows={result.data.filter((r) => r.deliveryStatus !== "DRIVER_ASSIGNED")} actionable emptyTitle="لا يوجد طلب قيد التوصيل" emptyText="بعد استلام الطلب من النشاط يظهر هنا." />
      ) : (
        <ResultState result={result} />
      )}
    </>
  );
}
