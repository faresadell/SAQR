import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadPackages } from "@/features/customer/data";
import { PackagesView } from "@/features/shared/packages-view";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الباقات والشحن" };

export default async function PackagesPage() {
  const { user } = await requireRole("CUSTOMER");
  const result = await loadPackages(user);
  return (
    <>
      <PageHeader title="الباقات والشحن" description="اختر باقة، حوّل المبلغ، وارفع الإيصال للمراجعة." />
      {result.status === "ready" ? <PackagesView {...result.data} /> : <ResultState result={result} />}
    </>
  );
}
