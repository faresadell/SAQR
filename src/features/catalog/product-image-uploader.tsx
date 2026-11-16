"use client";

import { ImageUploader } from "@/features/media/image-uploader";

/** Product picture on the edit page. */
export function ProductImageUploader({ productId, hasImage }: { productId: string; hasImage: boolean }) {
  return <ImageUploader endpoint={`/api/v1/products/${productId}/image`} hasImage={hasImage} addLabel="إضافة صورة للمنتج" changeLabel="تغيير صورة المنتج" />;
}
