import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadOrder } from "@/features/customer/data";
import { OrderDetailView } from "@/features/customer/orders-views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "تفاصيل الطلب" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireRole("CUSTOMER");
  const { id } = await params;
  const result = await loadOrder(user, id.slice(0, 64));
  if (result.status !== "ready") return <ResultState result={result} />;
  if (!result.data) notFound();
  return <OrderDetailView order={result.data} base="/account" />;
}
