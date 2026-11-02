import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { consumeRateLimit } from "@/lib/rate-limit";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { placeOrder } from "@/server/orders/checkout";
import { listOrdersForActor } from "@/server/orders/read";

const ORDER_STATUSES = ["AWAITING_PAYMENT", "AWAITING_MERCHANT_APPROVAL", "APPROVED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLATION_REQUESTED", "CANCELLED", "REJECTED"] as const;

const placeSchema = z
  .object({
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    addressId: z.string().min(1).max(64),
    lines: z
      .array(z.object({ productId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(99), expectedUnitPriceCents: z.number().int().min(0).max(10_000_000).optional() }).strict())
      .min(1)
      .max(50),
  })
  .strict();

/** GET /api/v1/orders?cursor=&limit=&status=  — the signed-in user's suborders (customer: own, merchant: own shop). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const q = request.nextUrl.searchParams;
    const status = q.get("status");
    if (status && !(ORDER_STATUSES as readonly string[]).includes(status)) return apiError(422, "VALIDATION_FAILED", "status");
    const limit = Number(q.get("limit") ?? "20");
    if (!Number.isInteger(limit)) return apiError(422, "VALIDATION_FAILED", "limit");
    return apiOk(await listOrdersForActor(actor, { cursor: q.get("cursor") ?? undefined, limit, status: status ?? undefined }));
  } catch (error) {
    return mapThrown(error);
  }
}

/** POST /api/v1/orders — customer checkout. One parent order, one suborder per merchant. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    if (actor.role !== "CUSTOMER") return apiError(403, "FORBIDDEN");
    const body = await readJson(request, placeSchema);
    if (!body.ok) return body.response;
    if (!(await consumeRateLimit(`order:place:${actor.id}`, 30, 3600))) return apiError(429, "RATE_LIMITED");

    const result = await placeOrder(actor, body.data);
    if (!result.ok) {
      return NextResponse.json({ error: { code: result.error, productId: result.productId, merchantId: result.merchantId } }, { status: statusForCode(result.error), headers: { "Cache-Control": "no-store" } });
    }
    return apiOk(
      { parentOrderId: result.parentOrderId, suborderIds: result.suborderIds, subtotalCents: result.quote.subtotalCents, deliveryFeeCents: result.quote.deliveryFeeCents, totalCents: result.quote.totalCents, replayed: result.replayed },
      result.replayed ? 200 : 201,
    );
  } catch (error) {
    return mapThrown(error);
  }
}
