import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { logoutAction } from "@/app/(auth)/actions";
import { canEditOwnProfile } from "@/lib/catalog/catalog-policy";
import { emptyWeek, validateOpeningHours, type OpeningHours } from "@/lib/catalog/opening-hours";
import { formatEgp } from "@/lib/money";
import { requireRole } from "@/server/auth/guards";
import { listBusinessTypes } from "@/server/catalog/categories";
import { listOwnProducts, listUsableCategories } from "@/server/catalog/products";
import { getOwnMerchant } from "@/server/merchants/service";
import { archiveProductAction, resubmitMerchantAction, toggleAvailabilityAction } from "./actions";
import { ProductForm } from "./product-forms";
import { ProfileForm, type ProfileDefaults } from "./profile-form";

export const metadata: Metadata = { title: "لوحة التاجر" };

const statusInfo = {
  PENDING_REVIEW: { tone: "warning", label: "قيد المراجعة", text: "نراجع بيانات نشاطك. يمكنك تعديلها حتى يتم الاعتماد." },
  APPROVED: { tone: "success", label: "معتمد", text: "نشاطك معتمد ويمكنك إدارة منتجاتك." },
  REJECTED: { tone: "danger", label: "مرفوض", text: "تم رفض الطلب." },
  SUSPENDED: { tone: "danger", label: "موقوف", text: "تم إيقاف نشاطك. تواصل مع الدعم." },
} as const;

function weekFrom(json: unknown): OpeningHours {
  if (json === null || json === undefined) return emptyWeek();
  const parsed = validateOpeningHours(json);
  return parsed.ok ? parsed.value : emptyWeek();
}

export default async function MerchantPage() {
  const { user } = await requireRole("MERCHANT");
  const [shop, businessTypes] = await Promise.all([getOwnMerchant(user), listBusinessTypes(true)]);
  const canEdit = !shop || canEditOwnProfile(user, shop);

  const defaults: ProfileDefaults = {
    name: shop?.name ?? "",
    description: shop?.description ?? "",
    businessType: shop?.businessType ?? "",
    phone: shop?.phone ?? "",
    address: shop?.address ?? "",
    lat: shop?.lat?.toString() ?? "",
    lng: shop?.lng?.toString() ?? "",
    hours: weekFrom(shop?.openingHours),
  };

  const [products, categories] = shop?.status === "APPROVED" ? await Promise.all([listOwnProducts(user), listUsableCategories()]) : [[], []];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">لوحة التاجر</h1>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm">خروج</Button>
        </form>
      </div>

      {shop ? (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{shop.name}</h2>
            <Badge tone={statusInfo[shop.status].tone}>{statusInfo[shop.status].label}</Badge>
          </div>
          <p className="text-sm text-ink-muted">{statusInfo[shop.status].text}</p>
          {shop.status === "REJECTED" ? (
            <>
              {shop.rejectionReason ? <p className="rounded-control bg-danger-soft p-3 text-sm text-danger-ink">السبب: {shop.rejectionReason}</p> : null}
              <form action={resubmitMerchantAction}>
                <Button type="submit" size="sm">إعادة إرسال للمراجعة</Button>
              </form>
            </>
          ) : null}
        </Card>
      ) : (
        <Card>
          <p className="text-ink-muted">أكمل بيانات نشاطك وسنراجعها قبل ظهوره للعملاء.</p>
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">بيانات النشاط</h2>
        <ProfileForm defaults={defaults} businessTypes={businessTypes.map((t) => ({ code: t.code, nameAr: t.nameAr }))} canEdit={canEdit} />
      </Card>

      {shop?.status === "APPROVED" ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">المنتجات</h2>
          {categories.length === 0 ? (
            <p className="rounded-control bg-warning-soft p-3 text-sm font-medium text-warning-ink">لا توجد تصنيفات متاحة بعد. ستظهر هنا عندما تضيفها الإدارة.</p>
          ) : (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-brand">إضافة منتج جديد</summary>
              <div className="mt-3"><ProductForm mode="create" categories={categories} defaults={{ name: "", description: "", price: "", categoryId: "", isAvailable: true }} /></div>
            </details>
          )}

          <div className="flex flex-col gap-3">
            {products.map((p) => (
              <div key={p.id} className="flex flex-col gap-3 rounded-control border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{p.nameAr}</p>
                    <p className="text-sm text-ink-muted">{p.category.nameAr}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{formatEgp(p.priceCents)}</span>
                    <Badge tone={p.isAvailable ? "success" : "neutral"}>{p.isAvailable ? "متاح" : "غير متاح"}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={toggleAvailabilityAction}>
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="available" value={p.isAvailable ? "false" : "true"} />
                    <Button type="submit" size="sm" variant="secondary">{p.isAvailable ? "إيقاف مؤقت" : "إتاحة"}</Button>
                  </form>
                  <form action={archiveProductAction}>
                    <input type="hidden" name="productId" value={p.id} />
                    <Button type="submit" size="sm" variant="ghost">أرشفة</Button>
                  </form>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-brand">تعديل</summary>
                  <div className="mt-3">
                    <ProductForm mode="edit" categories={categories} defaults={{ id: p.id, name: p.nameAr, description: p.description ?? "", price: (p.priceCents / 100).toFixed(2), categoryId: p.categoryId, isAvailable: p.isAvailable }} />
                  </div>
                </details>
              </div>
            ))}
            {products.length === 0 ? <p className="text-ink-muted">لا توجد منتجات بعد.</p> : null}
          </div>
        </Card>
      ) : null}
    </main>
  );
}
