import { NextResponse, type NextRequest } from "next/server";
import { apiError, mapThrown } from "@/server/api/http";
import { readShopImage } from "@/server/merchants/admin-shops";

/** GET /api/v1/shops/{id}/image — the picture of an approved shop (public). 404 otherwise. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const image = await readShopImage(id);
    if (!image) return apiError(404, "NOT_FOUND");
    return new NextResponse(Buffer.from(image.bytes), {
      headers: {
        "Content-Type": image.contentType,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    return mapThrown(error);
  }
}
