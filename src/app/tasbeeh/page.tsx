import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { PageHeader } from "@/components/ui/page-header";
import { TasbeehView } from "@/features/tasbeeh/tasbeeh-view";

export const metadata: Metadata = { title: "التسبيح" };

/** Open to everyone: the counter keeps its data on the device only, so no account is needed. */
export default function PublicTasbeehPage() {
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader title="التسبيح" description="عدّاد هادئ للأذكار، يعمل على الهاتف والكمبيوتر." />
        <TasbeehView />
      </div>
    </SiteShell>
  );
}
