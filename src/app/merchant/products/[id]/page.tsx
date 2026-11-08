import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProductImageUploader } from "@/features/catalog/product-image-uploader";
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
      <Card className="flex max-w-2xl flex-col gap-3">
        <h2 className="text-lg font-bold">صورة المنتج</h2>
        <p className="text-sm text-ink-muted">JPG أو PNG أو WebP، حتى 5 ميجابايت. تظهر للعملاء أثناء كون المنتج متاحاً.</p>
        <ProductImageUploader productId={product.id} hasImage={product.imageKey !== null} />
      </Card>
    </>
  );
}
