import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { TasbeehView } from "@/features/tasbeeh/tasbeeh-view";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "التسبيح" };

export default async function TasbeehPage() {
  await requireRole("CUSTOMER");
  return (
    <>
      <PageHeader title="التسبيح" description="عدّاد هادئ للأذكار، يعمل على الهاتف والكمبيوتر." />
      <TasbeehView />
    </>
  );
}
