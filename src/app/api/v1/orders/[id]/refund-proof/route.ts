import { NextResponse, type NextRequest } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { MAX_RECEIPT_BYTES } from "@/lib/uploads/image-sniff";
import { apiError, apiOk, checkOrigin, currentActor, mapThrown } from "@/server/api/http";
import { uploadRefundProof } from "@/server/orders/receipts";

const STATUS = { INVALID_FILE: 415, FILE_TOO_LARGE: 413, WRONG_STATE: 409, TOO_MANY_UPLOADS: 429 } as const;

/** POST /api/v1/orders/{id}/refund-proof — shop owner uploads the refund transfer picture (multipart "file"). Returns {uploadId} for POST /refunds/{id}/proof. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const bad = checkOrigin(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    if (Number(request.headers.get("content-length") ?? "0") > MAX_RECEIPT_BYTES + 64 * 1024) return apiError(413, "FILE_TOO_LARGE");
    if (!(await consumeRateLimit(`order:refund-proof:${actor.id}`, 20, 3600))) return apiError(429, "RATE_LIMITED");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return apiError(422, "VALIDATION_FAILED", "file");
    const { id } = await context.params;
    const result = await uploadRefundProof(actor, id, new Uint8Array(await file.arrayBuffer()));
    if (!result.ok) return apiError(STATUS[result.error], result.error);
    return apiOk({ uploadId: result.uploadId }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
