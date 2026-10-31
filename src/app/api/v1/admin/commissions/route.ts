import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson } from "@/server/api/http";
import { listCommissionHistory, scheduleCommissionRate } from "@/server/commissions/service";

const schema = z.object({ tier: z.enum(["REGULAR", "BUSINESS"]), basisPoints: z.number().int(), effectiveFrom: z.string().max(40).nullable().optional() }).strict();

/** GET /api/v1/admin/commissions — full rate history per tier (800 = 8.00%). Needs settings.view. */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk({ items: await listCommissionHistory(actor) });
  } catch (error) {
    return mapThrown(error);
  }
}

/** POST /api/v1/admin/commissions {tier, basisPoints, effectiveFrom?} — schedule a rate; never edits history, never touches existing orders. Needs settings.manage. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const result = await scheduleCommissionRate(actor, body.data.tier, body.data.basisPoints, body.data.effectiveFrom ?? null);
    if (!result.ok) return apiError(422, result.error);
    return apiOk({ effectiveFrom: result.effectiveFrom }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
