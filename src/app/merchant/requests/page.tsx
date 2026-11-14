import type { Metadata } from "next";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { PageHeader } from "@/components/ui/page-header";
import { RequestList } from "@/features/requests/request-views";
import { requireRole } from "@/server/auth/guards";
import { listOrderRequests } from "@/server/orders/requests";

export const metadata: Metadata = { title: "طلبات مخصصة" };

export default async function MerchantRequestsPage() {
  const { user } = await requireRole("MERCHANT");
  const rows = await listOrderRequests(user);
  return (
    <>
      <AutoRefresh />
      <PageHeader title="طلبات مخصصة" description="طلبات العملاء المكتوبة. حدّد سعراً نهائياً واحداً أو اعتذر." />
      <RequestList rows={rows} base="/merchant/requests" />
    </>
  );
}
