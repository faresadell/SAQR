import type { Metadata } from "next";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { PageHeader } from "@/components/ui/page-header";
import { RequestDetail } from "@/features/requests/request-views";
import { requireRole } from "@/server/auth/guards";
import { getOrderRequest } from "@/server/orders/requests";

export const metadata: Metadata = { title: "طلب مخصص" };

export default async function CustomerRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireRole("CUSTOMER");
  const { id } = await params;
  const request = await getOrderRequest(user, id).catch(() => null);
  if (!request) return <PageHeader title="الطلب غير موجود" />;
  return (
    <>
      <AutoRefresh />
      <PageHeader title="طلب مخصص" />
      <RequestDetail request={request} />
    </>
  );
}
