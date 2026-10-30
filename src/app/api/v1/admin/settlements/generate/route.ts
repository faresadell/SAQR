import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasPermission } from "@/lib/auth/permissions";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { generateSettlements } from "@/server/settlements/service";

const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict();

/** POST /api/v1/admin/settlements/generate {month:"YYYY-MM"} — builds the statements of a CLOSED month. Safe to repeat. Needs settlements.manage. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    if (!hasPermission(actor, "settlements.manage")) return apiError(404, "NOT_FOUND");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const result = await generateSettlements(body.data.month, actor);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk(result.summary);
  } catch (error) {
    return mapThrown(error);
  }
}
