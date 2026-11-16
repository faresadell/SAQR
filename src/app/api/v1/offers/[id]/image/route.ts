import type { NextRequest, NextResponse } from "next/server";
import { guardedImage, receiveImage } from "@/server/api/image-routes";
import { readOfferImage, uploadOfferImage } from "@/server/offers/images";

/** GET /api/v1/offers/{id}/image — the picture of a running offer (public). 404 otherwise. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return guardedImage(async () => readOfferImage((await context.params).id));
}

/** POST /api/v1/offers/{id}/image — multipart/form-data with one image field "file" (JPEG/PNG/WebP, max 5 MB). Shop owner of that offer only. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params;
  return receiveImage(request, "offer:image", (actor, bytes) => uploadOfferImage(actor, id, bytes));
}
