import { NextResponse, type NextRequest } from "next/server";
import { apiError, currentActor, mapThrown } from "@/server/api/http";
import { readReceipt } from "@/server/orders/receipts";

/** GET /api/v1/receipts/{uploadId} — the image, only for the order's customer, its shop owner, or an admin with payments.review. */
export async function GET(_request: NextRequest, context: { params: Promise<{ uploadId: string }> }): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const { uploadId } = await context.params;
    const { bytes, contentType } = await readReceipt(actor, uploadId);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline; filename=receipt",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return mapThrown(error);
  }
}
