import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadAddresses } from "@/features/customer/data";
import { AddressesView } from "@/features/customer/views";
import { ResultState } from "@/features/shared/result-state";
import { listOpenZones } from "@/server/addresses/zones";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "العناوين" };

export default async function AddressesPage() {
  const { user } = await requireRole("CUSTOMER");
  const [result, zones] = await Promise.all([loadAddresses(user), listOpenZones()]);
  return (
    <>
      <PageHeader title="العناوين" description="عناوين التوصيل المحفوظة ومناطقها." />
      {result.status === "ready" ? <AddressesView items={result.data} zones={zones} /> : <ResultState result={result} />}
    </>
  );
}
