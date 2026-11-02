import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { extendOffer } from "@/server/offers/service";

const schema = z.object({ hours: z.number().int().min(1).max(1000), idempotencyKey: z.string().min(8).max(64) }).strict();

/**
 * POST /api/v1/offers/{id}/extend {hours, idempotencyKey} — adds whole hours; costs hours x the per-hour star setting (1 by default).
 * Repeating the same idempotencyKey never charges twice (returns replayed:true). 409 INSUFFICIENT_STARS | OFFER_NOT_ACTIVE | CONFLICT.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const { id } = await context.params;
    const result = await extendOffer(actor, id, body.data);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ endsAt: result.endsAt, starsCharged: result.starsCharged, replayed: result.replayed });
  } catch (error) {
    return mapThrown(error);
  }
}
