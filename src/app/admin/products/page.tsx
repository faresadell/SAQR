import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatEgp } from "@/lib/money";
import { requirePermission } from "@/server/auth/guards";
import { listProductsForAdmin, listShopOptions } from "@/server/catalog/admin-products";
import { listUsableCategories } from "@/server/catalog/products";
import { AdminCreateProductForm, AdminProductRow } from "./product-forms";

export const metadata: Metadata = { title: "منتجات الأنشطة" };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ shop?: string; q?: string; archived?: string }> }) {
  const { user } = await requirePermission("catalog.manage");
  const { shop, q, archived } = await searchParams;
  const showArchived = archived === "1";
  const [shops, categories, products] = await Promise.all([
    listShopOptions(user),
    listUsableCategories(),
    listProductsForAdmin(user, { merchantId: shop || undefined, q, archived: showArchived }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="منتجات الأنشطة" description="أضف أو عدّل أو اسحب أي منتج من أي نشاط. كل تغيير يُسجَّل في سجل المراجعة، والطلبات القديمة لا تتأثر." />

      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">إضافة منتج لنشاط</h2>
        <AdminCreateProductForm shops={shops} categories={categories} />
      </Card>

      <Card className="flex flex-col gap-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">النشاط
            <select name="shop" defaultValue={shop ?? ""} className="rounded-control border border-line bg-surface px-3 py-2 font-normal">
              <option value="">كل الأنشطة</option>
              {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">بحث بالاسم
            <input name="q" defaultValue={q ?? ""} maxLength={60} className="rounded-control border border-line bg-surface px-3 py-2 font-normal" />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm font-semibold"><input type="checkbox" name="archived" value="1" defaultChecked={showArchived} /> المسحوبة فقط</label>
          <button type="submit" className="rounded-control bg-navy-900 px-4 py-2 text-sm font-bold text-white">تصفية</button>
          <Link href="/admin/products" className="pb-2 text-sm font-semibold text-brand">إعادة ضبط</Link>
        </form>

        {products.length === 0 ? (
          <p className="text-ink-muted">لا توجد منتجات مطابقة.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {products.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 rounded-control border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">{p.nameAr}</p>
                    <p className="text-sm text-ink-muted">{p.merchant.name} · {p.category.nameAr}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="num font-bold">{formatEgp(p.priceCents)}</span>
                    {p.archivedAt ? <Badge tone="danger">مسحوب</Badge> : <Badge tone={p.isAvailable ? "success" : "neutral"}>{p.isAvailable ? "متاح" : "غير متاح"}</Badge>}
                  </div>
                </div>
                <AdminProductRow
                  p={{ id: p.id, name: p.nameAr, description: p.description ?? "", price: (p.priceCents / 100).toFixed(2), categoryId: p.categoryId, isAvailable: p.isAvailable, archived: p.archivedAt !== null }}
                  categories={categories}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-faint">يعرض أحدث 100 منتج. استخدم التصفية للوصول لمنتج بعينه.</p>
      </Card>
    </div>
  );
}
