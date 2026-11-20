import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { AvailabilityCard } from "@/features/driver/availability-card";
import { loadDriverHome } from "@/features/driver/data";
import { DriverHomeView } from "@/features/driver/views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";
import { getMyAvailability } from "@/server/drivers/service";

export const metadata: Metadata = { title: "الرئيسية" };

export default async function DriverHomePage() {
  const { user } = await requireRole("DRIVER");
  const [result, availability] = await Promise.all([loadDriverHome(user), getMyAvailability(user).catch(() => null)]);
  return (
    <>
      <PageHeader title={`أهلاً ${user.name}`} description="ملخص يومك ومهامك." />
      {availability ? <div className="mb-5"><AvailabilityCard {...availability} /></div> : null}
      {result.status === "ready" ? <DriverHomeView data={result.data} base="/driver" /> : <ResultState result={result} />}
    </>
  );
}
