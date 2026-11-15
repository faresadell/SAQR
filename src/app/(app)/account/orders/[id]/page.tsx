import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadOrder } from "@/features/customer/data";
import { OrderDetailView } from "@/features/customer/orders-views";
import { ResultState } from "@/features/shared/result-state";
import { listMyComplaints } from "@/server/complaints/service";
import { requireRole } from "@/server/auth/guards";
import { db } from "@/lib/db";
import { listShopAccountsForCustomer } from "@/server/payments/merchant-accounts";

export const metadata: Metadata = { title: "تفاصيل الطلب" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireRole("CUSTOMER");
  const { id } = await params;
  const result = await loadOrder(user, id.slice(0, 64));
  if (result.status !== "ready") return <ResultState result={result} />;
  if (!result.data) notFound();
  const subs = await db.order.findMany({ where: { id: { in: result.data.subOrders.map((x) => x.id) }, customerId: user.id }, select: { id: true, merchantId: true, deliveryCode: true, deliveryStatus: true } });
  const shopAccounts = await listShopAccountsForCustomer([...new Set(subs.map((x) => x.merchantId))]);
  const codesByOrder = Object.fromEntries(subs.filter((x) => x.deliveryCode && x.deliveryStatus === "PICKED_UP").map((x) => [x.id, x.deliveryCode as string]));
  const accountsByOrder = Object.fromEntries(subs.map((x) => [x.id, shopAccounts.filter((a) => a.merchantId === x.merchantId).map((a) => ({ id: a.id, methodLabel: a.methodLabel, accountValue: a.accountValue, holderName: a.holderName }))]));
  const mine = await listMyComplaints(user);
  const ids = new Set(result.data.subOrders.map((s) => s.id));
  const complaints = mine.filter((c) => ids.has(c.orderId)).map((c) => ({ id: c.id, orderId: c.orderId, subject: c.subject, status: c.status, adminResponse: c.adminResponse }));
  return <OrderDetailView order={result.data} base="/account" accountsByOrder={accountsByOrder} codesByOrder={codesByOrder} complaints={complaints} />;
}
