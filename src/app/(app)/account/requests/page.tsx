import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { PageHeader } from "@/components/ui/page-header";
import { RequestList } from "@/features/requests/request-views";
import { requireRole } from "@/server/auth/guards";
import { listOrderRequests } from "@/server/orders/requests";

export const metadata: Metadata = { title: "طلبات مخصصة" };

export default async function CustomerRequestsPage() {
  const { user } = await requireRole("CUSTOMER");
  const rows = await listOrderRequests(user);
  return (
    <>
      <AutoRefresh />
      <PageHeader title="طلبات مخصصة" description="اكتب ما تريده من أي نشاط، ويرد عليك بسعر نهائي واحد." />
      <p className="mb-4 text-sm text-ink-muted">لبدء طلب جديد افتح صفحة النشاط واختر <Link href="/explore" className="font-bold text-brand underline">«اطلب بكلماتك»</Link>.</p>
      <RequestList rows={rows} base="/account/requests" />
    </>
  );
}
