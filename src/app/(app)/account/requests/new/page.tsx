import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { NewRequestForm } from "@/features/requests/requests-ui";
import { db } from "@/lib/db";
import { requireRole } from "@/server/auth/guards";
import { listMyAddresses } from "@/server/addresses/service";

export const metadata: Metadata = { title: "اطلب بكلماتك" };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ shop?: string }> }) {
  const { user } = await requireRole("CUSTOMER");
  const { shop: shopId = "" } = await searchParams;
  const [shop, addresses] = await Promise.all([db.merchant.findFirst({ where: { id: shopId.slice(0, 64), status: "APPROVED" }, select: { id: true, name: true } }), listMyAddresses(user)]);
  if (!shop) return <EmptyState icon="box" title="هذا النشاط غير متاح للطلب" />;
  if (addresses.length === 0) return <EmptyState icon="pin" title="أضف عنوان توصيل أولاً"><Link href="/account/addresses" className="font-bold text-brand underline">إضافة عنوان</Link></EmptyState>;
  return (
    <>
      <PageHeader title={`اطلب من ${shop.name}`} description="اكتب طلبك بكلماتك. لا يلزم اختيار منتجات من القائمة." />
      <NewRequestForm merchantId={shop.id} addresses={addresses.map((a) => ({ id: a.id, label: a.label, line: a.line }))} />
    </>
  );
}
