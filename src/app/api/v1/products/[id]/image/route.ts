import { NextResponse, type NextRequest } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { MAX_RECEIPT_BYTES } from "@/lib/uploads/image-sniff";
import { apiError, apiOk, checkOrigin, currentActor, mapThrown } from "@/server/api/http";
import { readProductImage, uploadProductImage } from "@/server/catalog/product-images";

const STATUS = { INVALID_FILE: 415, FILE_TOO_LARGE: 413 } as const;

/** GET /api/v1/products/{id}/image — the picture of a product shoppers can see (public). 404 otherwise. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const image = await readProductImage(id);
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

/** POST /api/v1/products/{id}/image — multipart/form-data with one image field "file" (JPEG/PNG/WebP, max 5 MB). Shop owner of that product only. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const bad = checkOrigin(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    if (Number(request.headers.get("content-length") ?? "0") > MAX_RECEIPT_BYTES + 64 * 1024) return apiError(413, "FILE_TOO_LARGE");
    if (!(await consumeRateLimit(`product:image:${actor.id}`, 60, 3600))) return apiError(429, "RATE_LIMITED");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return apiError(422, "VALIDATION_FAILED", "file");
    const { id } = await context.params;
    const result = await uploadProductImage(actor, id, new Uint8Array(await file.arrayBuffer()));
    if (!result.ok) return apiError(STATUS[result.error], result.error);
    return apiOk({ ok: true }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
