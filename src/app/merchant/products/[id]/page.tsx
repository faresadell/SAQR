import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth/guards";
import { listOwnProducts, listUsableCategories } from "@/server/catalog/products";
import { ProductForm } from "../../product-forms";

export const metadata: Metadata = { title: "تعديل منتج" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireRole("MERCHANT");
  const { id } = await params;
  // Looked up inside the merchant's own products, so another merchant's id is simply "not found".
  const product = (await listOwnProducts(user)).find((p) => p.id === id);
  if (!product) notFound();
  const categories = await listUsableCategories();
  return (
    <>
      <PageHeader title={`تعديل: ${product.nameAr}`} />
      <Card className="max-w-2xl">
        <ProductForm
          mode="edit"
          categories={categories}
          defaults={{ id: product.id, name: product.nameAr, description: product.description ?? "", price: (product.priceCents / 100).toFixed(2), categoryId: product.categoryId, isAvailable: product.isAvailable }}
        />
      </Card>
    </>
  );
}
