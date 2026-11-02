import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { updatePlan } from "@/server/plans/service";

const schema = z.object({ priceCents: z.number().int().optional(), baseStars: z.number().int().optional(), bonusStars: z.number().int().optional(), offerQuota: z.number().int().nullable().optional(), isActive: z.boolean().optional() }).strict();

/** PATCH /api/v1/admin/plans/{code} — edit price/stars/bonus/availability for FUTURE purchases (past purchases keep their snapshot). Needs settings.manage. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const { code } = await context.params;
    const result = await updatePlan(actor, code, body.data);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
