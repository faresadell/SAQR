import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumeRateLimit } from "@/lib/rate-limit";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { requestMembershipPurchase } from "@/server/memberships/service";

const schema = z.object({ planCode: z.string().min(1).max(40), method: z.string().min(1).max(40), referenceNo: z.string().min(1).max(64), uploadId: z.string().min(8).max(64) }).strict();

/** POST /api/v1/memberships/purchases — shop owner sends transfer proof (upload it first with POST /api/v1/plans/receipt). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    if (!(await consumeRateLimit(`membership:purchase:${actor.id}`, 10, 3600))) return apiError(429, "RATE_LIMITED");
    const result = await requestMembershipPurchase(actor, body.data);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ purchaseId: result.purchaseId }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
