import type { NextRequest, NextResponse } from "next/server";
import { guardedImage, receiveImage } from "@/server/api/image-routes";
import { readProductImage, uploadProductImage } from "@/server/catalog/product-images";

/** GET /api/v1/products/{id}/image — the picture of a product shoppers can see (public). 404 otherwise. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return guardedImage(async () => readProductImage((await context.params).id));
}

/** POST /api/v1/products/{id}/image — multipart/form-data with one image field "file" (JPEG/PNG/WebP, max 5 MB). Shop owner of that product only. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params;
  return receiveImage(request, "product:image", (actor, bytes) => uploadProductImage(actor, id, bytes));
}
