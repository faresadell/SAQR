import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadDriverHome } from "@/features/driver/data";
import { DriverHomeView } from "@/features/driver/views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الرئيسية" };

export default async function DriverHomePage() {
  const { user } = await requireRole("DRIVER");
  const result = await loadDriverHome(user);
  return (
    <>
      <PageHeader title={`أهلاً ${user.name}`} description="ملخص يومك ومهامك." />
      {result.status === "ready" ? <DriverHomeView data={result.data} base="/driver" /> : <ResultState result={result} />}
    </>
  );
}
