import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth/guards";
import { listUsableCategories } from "@/server/catalog/products";
import { getOwnMerchant } from "@/server/merchants/service";
import { ProductForm } from "../../product-forms";

export const metadata: Metadata = { title: "إضافة منتج" };

export default async function NewProductPage() {
  const { user } = await requireRole("MERCHANT");
  const shop = await getOwnMerchant(user);
  const categories = shop?.status === "APPROVED" ? await listUsableCategories() : [];
  return (
    <>
      <PageHeader title="إضافة منتج" />
      {shop?.status !== "APPROVED" ? (
        <Notice tone="warning">تُضاف المنتجات بعد اعتماد نشاطك.</Notice>
      ) : categories.length === 0 ? (
        <Notice tone="warning">لا توجد تصنيفات متاحة بعد. ستظهر عندما تضيفها الإدارة.</Notice>
      ) : (
        <Card className="max-w-2xl">
          <ProductForm mode="create" categories={categories} defaults={{ name: "", description: "", price: "", categoryId: "", isAvailable: true }} />
        </Card>
      )}
    </>
  );
}
