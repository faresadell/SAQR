import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/states";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { SafeImage } from "@/components/ui/safe-image";
import { formatEgp } from "@/lib/money";
import { requireRole } from "@/server/auth/guards";
import { listOwnProducts } from "@/server/catalog/products";
import { getOwnMerchant } from "@/server/merchants/service";
import { archiveProductAction, toggleAvailabilityAction } from "../actions";

export const metadata: Metadata = { title: "المنتجات" };

export default async function MerchantProductsPage() {
  const { user } = await requireRole("MERCHANT");
  const shop = await getOwnMerchant(user);
  if (shop?.status !== "APPROVED") {
    return (
      <>
        <PageHeader title="المنتجات" />
        <Notice tone="warning">تُدار المنتجات بعد اعتماد نشاطك من الإدارة.</Notice>
      </>
    );
  }
  const products = await listOwnProducts(user);
  return (
    <>
      <PageHeader title="المنتجات" description="أضف منتجاتك وعدّل أسعارها وتوفرها." actions={<LinkButton href="/merchant/products/new">إضافة منتج</LinkButton>} />
      {products.length === 0 ? (
        <EmptyState icon="store" title="لا توجد منتجات بعد" action={<LinkButton href="/merchant/products/new">أضف أول منتج</LinkButton>}>
          المنتجات تظهر للعملاء فور إضافتها.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {products.map((p) => (
            <li key={p.id}>
              <Card className="flex gap-3 p-3">
                <SafeImage alt="" src={null} fallbackIcon="box" className="size-20 shrink-0 rounded-control" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{p.nameAr}</p>
                      <p className="text-xs text-ink-muted">{p.category.nameAr}</p>
                    </div>
                    <Badge tone={p.isAvailable ? "success" : "neutral"}>{p.isAvailable ? "متاح" : "غير متاح"}</Badge>
                  </div>
                  <p className="num font-bold">{formatEgp(p.priceCents)}</p>
                  <div className="flex flex-wrap gap-2">
                    <LinkButton href={`/merchant/products/${p.id}`} size="sm" variant="outline">تعديل</LinkButton>
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
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
