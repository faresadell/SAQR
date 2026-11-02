import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { updateMembershipPlan } from "@/server/memberships/service";

const schema = z.object({ priceCents: z.number().int().optional(), durationDays: z.number().int().optional(), isActive: z.boolean().optional() }).strict();

/** PATCH /api/v1/admin/membership-plans/{code} — edit price/duration/availability for future purchases. Needs settings.manage. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const { code } = await context.params;
    const result = await updateMembershipPlan(actor, code, body.data);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
