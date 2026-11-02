import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumeRateLimit } from "@/lib/rate-limit";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { requestPlanPurchase } from "@/server/plans/service";

const schema = z.object({ planCode: z.string().min(1).max(60), method: z.string().min(1).max(40), referenceNo: z.string().min(1).max(64), uploadId: z.string().min(8).max(64) }).strict();

/** POST /api/v1/plans/purchases — send transfer proof for a plan. Nothing is activated until an admin approves. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    if (!(await consumeRateLimit(`plan:purchase:${actor.id}`, 10, 3600))) return apiError(429, "RATE_LIMITED");
    const result = await requestPlanPurchase(actor, body.data);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ purchaseId: result.purchaseId }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
