import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadMyDeliveries } from "@/features/driver/data";
import { DeliveryList } from "@/features/driver/views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الطلبات المسندة" };

export default async function DriverTasksPage() {
  const { user } = await requireRole("DRIVER");
  const result = await loadMyDeliveries(user, "ACTIVE");
  return (
    <>
      <PageHeader title="الطلبات المسندة إليّ" description="طلبات أسندها لك النشاط وبانتظار استلامك." />
      {result.status === "ready" ? (
        <DeliveryList rows={result.data.filter((r) => r.deliveryStatus === "DRIVER_ASSIGNED")} actionable emptyTitle="لا توجد طلبات مسندة الآن" emptyText="ستظهر هنا عندما يسند لك النشاط طلباً." />
      ) : (
        <ResultState result={result} />
      )}
    </>
  );
}
