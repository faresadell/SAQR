import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadAvailableTasks } from "@/features/driver/data";
import { TripListView } from "@/features/driver/views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "المهام المتاحة" };

export default async function DriverTasksPage() {
  const { user } = await requireRole("DRIVER");
  const result = await loadAvailableTasks(user);
  return (
    <>
      <PageHeader title="المهام المتاحة" description="رحلات يمكنك قبولها." />
      {result.status === "ready" ? <TripListView trips={result.data} emptyTitle="لا توجد مهام متاحة الآن" emptyText="ستظهر المهام الجديدة هنا." /> : <ResultState result={result} />}
    </>
  );
}
