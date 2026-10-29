import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { consumeRateLimit } from "@/lib/rate-limit";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { advanceOrder, cancelOrder, confirmPayment, decideOrder, rejectPayment, submitPayment, type LifecycleResult } from "@/server/orders/lifecycle";

const schemas = {
  payment: z.object({ method: z.string().min(1).max(40), referenceNo: z.string().min(1).max(64), receiptKey: z.string().min(1).max(200) }).strict(),
  "payment-confirm": z.object({}).strict(),
  "payment-reject": z.object({ reason: z.string().min(3).max(300) }).strict(),
  decision: z.object({ decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().min(3).max(300).optional() }).strict(),
  advance: z.object({ to: z.enum(["PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]) }).strict(),
  cancel: z.object({ reason: z.string().min(3).max(300) }).strict(),
} as const;
type Action = keyof typeof schemas;
const isAction = (value: string): value is Action => Object.hasOwn(schemas, value);

/**
 * POST /api/v1/orders/{id}/{action}
 *   payment          customer   {method, referenceNo, receiptKey}   submit transfer proof (does NOT confirm payment)
 *   payment-confirm  seller     {}                                   confirm the money arrived
 *   payment-reject   seller     {reason}                             reject the proof; customer may resubmit
 *   decision         seller     {decision: APPROVE|REJECT, reason?}  approve (charges stars once) or reject
 *   advance          seller     {to}                                 PREPARING | READY | OUT_FOR_DELIVERY | DELIVERED
 *   cancel           any party  {reason}                             see docs/api/orders.md for who may cancel when
 * "seller" = the shop owner, or an admin holding payments.review for the payment actions.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; action: string }> }): Promise<NextResponse> {
  try {
    const { id, action } = await context.params;
    if (!isAction(action)) return apiError(404, "NOT_FOUND");
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schemas[action]);
    if (!body.ok) return body.response;
    if (!(await consumeRateLimit(`order:${action}:${actor.id}`, 60, 3600))) return apiError(429, "RATE_LIMITED");

    let result: LifecycleResult;
    switch (action) {
      case "payment":
        result = await submitPayment(actor, id, body.data as z.infer<typeof schemas.payment>);
        break;
      case "payment-confirm":
        result = await confirmPayment(actor, id);
        break;
      case "payment-reject":
        result = await rejectPayment(actor, id, (body.data as z.infer<typeof schemas["payment-reject"]>).reason);
        break;
      case "decision": {
        const d = body.data as z.infer<typeof schemas.decision>;
        result = await decideOrder(actor, id, d.decision, d.reason);
        break;
      }
      case "advance":
        result = await advanceOrder(actor, id, (body.data as z.infer<typeof schemas.advance>).to);
        break;
      case "cancel":
        result = await cancelOrder(actor, id, (body.data as z.infer<typeof schemas.cancel>).reason);
        break;
    }
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
