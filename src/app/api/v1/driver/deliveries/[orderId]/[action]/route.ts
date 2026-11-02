import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { deliver, pickUp, reportFailure } from "@/server/orders/delivery";
import type { LifecycleResult } from "@/server/orders/lifecycle";

const schemas = {
  pickup: z.object({}).strict(),
  deliver: z.object({ feeCollected: z.boolean(), note: z.string().max(300).optional() }).strict(),
  fail: z.object({ reason: z.string().min(3).max(300) }).strict(),
} as const;
type Action = keyof typeof schemas;
const isAction = (value: string): value is Action => Object.hasOwn(schemas, value);

/**
 * POST /api/v1/driver/deliveries/{orderId}/{action}  (driver only, only for orders given to this driver)
 *   pickup   {}                              collected from the shop -> order OUT_FOR_DELIVERY
 *   deliver  {feeCollected, note?}           delivered; the cash delivery fee is recorded (note required if not collected)
 *   fail     {reason}                        could not deliver; the shop is told and can reassign
 */
export async function POST(request: NextRequest, context: { params: Promise<{ orderId: string; action: string }> }): Promise<NextResponse> {
  try {
    const { orderId, action } = await context.params;
    if (!isAction(action)) return apiError(404, "NOT_FOUND");
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schemas[action]);
    if (!body.ok) return body.response;
    let result: LifecycleResult;
    if (action === "pickup") result = await pickUp(actor, orderId);
    else if (action === "deliver") result = await deliver(actor, orderId, body.data as z.infer<typeof schemas.deliver>);
    else result = await reportFailure(actor, orderId, (body.data as z.infer<typeof schemas.fail>).reason);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
