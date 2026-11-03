import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/server/auth/guards";
import { listBusinessTypes } from "@/server/catalog/categories";
import { listOwnerCandidates } from "@/server/merchants/admin-shops";
import { EMPTY_SHOP, ShopForm } from "../shop-form";

export const metadata: Metadata = { title: "إضافة نشاط" };

export default async function NewShopPage() {
  const { user } = await requirePermission("merchants.review");
  const [types, owners] = await Promise.all([listBusinessTypes(true), listOwnerCandidates(user)]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="إضافة نشاط" description="اختر القسم وصاحب النشاط وأدخل بياناته. يظهر للعملاء فور الإضافة. الصورة تُرفع في الخطوة التالية." />
      <Link href="/admin/merchants" className="text-sm font-semibold underline">رجوع للتجار</Link>
      <ShopForm values={EMPTY_SHOP} types={types.map((t) => ({ code: t.code, nameAr: t.nameAr }))} owners={owners} />
    </div>
  );
}
