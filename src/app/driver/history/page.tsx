import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadTripHistory } from "@/features/driver/data";
import { TripListView } from "@/features/driver/views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "سجل الرحلات" };

export default async function DriverHistoryPage() {
  const { user } = await requireRole("DRIVER");
  const result = await loadTripHistory(user);
  return (
    <>
      <PageHeader title="سجل الرحلات" />
      {result.status === "ready" ? <TripListView trips={result.data} emptyTitle="لا توجد رحلات سابقة" emptyText="ستظهر رحلاتك المكتملة هنا." /> : <ResultState result={result} />}
    </>
  );
}
