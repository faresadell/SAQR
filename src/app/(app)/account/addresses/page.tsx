import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadAddresses } from "@/features/customer/data";
import { AddressesView } from "@/features/customer/views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "العناوين" };

export default async function AddressesPage() {
  const { user } = await requireRole("CUSTOMER");
  const result = await loadAddresses(user);
  return (
    <>
      <PageHeader title="العناوين" description="عناوين التوصيل المحفوظة ومناطقها." />
      {result.status === "ready" ? <AddressesView items={result.data} /> : <ResultState result={result} />}
    </>
  );
}
