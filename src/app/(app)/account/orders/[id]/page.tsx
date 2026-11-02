import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadOrder } from "@/features/customer/data";
import { OrderDetailView } from "@/features/customer/orders-views";
import { ResultState } from "@/features/shared/result-state";
import { listMyComplaints } from "@/server/complaints/service";
import { requireRole } from "@/server/auth/guards";
import { getEnabledPaymentMethods } from "@/server/payments/methods";

export const metadata: Metadata = { title: "تفاصيل الطلب" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireRole("CUSTOMER");
  const { id } = await params;
  const result = await loadOrder(user, id.slice(0, 64));
  if (result.status !== "ready") return <ResultState result={result} />;
  if (!result.data) notFound();
  const methods = (await getEnabledPaymentMethods()).map((m) => ({ code: m.code, label: m.nameAr, receiverNumber: m.receiverNumber ?? null }));
  const mine = await listMyComplaints(user);
  const ids = new Set(result.data.subOrders.map((s) => s.id));
  const complaints = mine.filter((c) => ids.has(c.orderId)).map((c) => ({ id: c.id, orderId: c.orderId, subject: c.subject, status: c.status, adminResponse: c.adminResponse }));
  return <OrderDetailView order={result.data} base="/account" methods={methods} complaints={complaints} />;
}
