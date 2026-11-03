import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Notice } from "@/components/ui/states";
import { parseSocialLinks } from "@/lib/catalog/shop-contact";
import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/guards";
import { listBusinessTypes } from "@/server/catalog/categories";
import { ShopForm, ShopImageUploader } from "../shop-form";

export const metadata: Metadata = { title: "بيانات النشاط" };

export default async function EditShopPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requirePermission("merchants.review");
  const { id } = await params;
  const { created } = await searchParams;
  const shop = await db.merchant.findUnique({ where: { id: id.slice(0, 64) }, include: { owner: { select: { name: true, phone: true } } } });
  if (!shop) notFound();
  const all = await listBusinessTypes();
  const types = all.filter((t) => t.isActive || t.code === shop.businessType).map((t) => ({ code: t.code, nameAr: t.nameAr }));
  const social = parseSocialLinks(shop.socialLinks);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={shop.name} description={`صاحب النشاط: ${shop.owner.name} · ${shop.owner.phone}`} />
      <Link href="/admin/merchants" className="text-sm font-semibold underline">رجوع للتجار</Link>
      {created ? <Notice tone="success">تمت إضافة النشاط. ارفع صورته من الأسفل.</Notice> : null}
      <ShopImageUploader merchantId={shop.id} hasImage={Boolean(shop.imageKey)} />
      <ShopForm
        values={{
          id: shop.id,
          name: shop.name,
          description: shop.description ?? "",
          businessType: shop.businessType,
          phone: shop.phone ?? "",
          address: shop.address ?? "",
          lat: shop.lat === null ? "" : String(shop.lat),
          lng: shop.lng === null ? "" : String(shop.lng),
          phones: shop.contactPhones.join("\n"),
          facebook: social.facebook ?? "",
          instagram: social.instagram ?? "",
          tiktok: social.tiktok ?? "",
          whatsapp: social.whatsapp ?? "",
          website: social.website ?? "",
        }}
        types={types}
      />
    </div>
  );
}
