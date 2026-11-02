import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { LegalPanel } from "@/features/admin/legal-panel";
import { requirePermission } from "@/server/auth/guards";
import { listLegalPages } from "@/server/legal/service";

export const metadata: Metadata = { title: "الصفحات القانونية" };

export default async function Page() {
  await requirePermission("content.manage");
  const rows = await listLegalPages();
  return (
    <>
      <PageHeader title="الصفحات القانونية" description="الشروط والخصوصية والإلغاء والاسترجاع والدعم وقواعد المسابقة. تبقى مسودة حتى تعتمدها." />
      <LegalPanel rows={rows.map((r) => ({ slug: r.slug, title: r.title, body: r.body, version: r.version, approved: r.approved }))} />
    </>
  );
}
