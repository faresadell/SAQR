import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadOrder } from "@/features/customer/data";
import { OrderDetailView } from "@/features/customer/orders-views";
import { ResultState } from "@/features/shared/result-state";
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
  return <OrderDetailView order={result.data} base="/account" methods={methods} />;
}
