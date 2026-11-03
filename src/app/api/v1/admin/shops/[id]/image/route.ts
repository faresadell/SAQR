import type { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { MAX_RECEIPT_BYTES } from "@/lib/uploads/image-sniff";
import { apiError, apiOk, checkOrigin, currentActor, mapThrown } from "@/server/api/http";
import { uploadShopImage } from "@/server/merchants/admin-shops";

const STATUS = { INVALID_FILE: 415, FILE_TOO_LARGE: 413 } as const;

/** POST /api/v1/admin/shops/{id}/image — multipart/form-data, one image field "file" (JPEG/PNG/WebP, max 5 MB). Needs merchants.review. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const bad = checkOrigin(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    if (Number(request.headers.get("content-length") ?? "0") > MAX_RECEIPT_BYTES + 64 * 1024) return apiError(413, "FILE_TOO_LARGE");
    if (!(await consumeRateLimit(`shop:image:${actor.id}`, 60, 3600))) return apiError(429, "RATE_LIMITED");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return apiError(422, "VALIDATION_FAILED", "file");
    const { id } = await context.params;
    const result = await uploadShopImage(actor, id, new Uint8Array(await file.arrayBuffer()));
    if (!result.ok) return apiError(STATUS[result.error], result.error);
    return apiOk({ ok: true }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
