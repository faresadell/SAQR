import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/states";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { loadActiveTrip } from "@/features/driver/data";
import { ActiveTripView } from "@/features/driver/views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الرحلة النشطة" };

export default async function DriverTripPage() {
  const { user } = await requireRole("DRIVER");
  const result = await loadActiveTrip(user);
  return (
    <>
      <PageHeader title="الرحلة النشطة" description="نقاط الاستلام والتسليم بالترتيب." />
      {result.status !== "ready" ? (
        <ResultState result={result} />
      ) : result.data ? (
        <ActiveTripView trip={result.data} />
      ) : (
        <EmptyState icon="navigation" title="لا توجد رحلة جارية" action={<LinkButton href="/driver/tasks">المهام المتاحة</LinkButton>} />
      )}
    </>
  );
}
