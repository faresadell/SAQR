import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { hasPermission } from "@/lib/auth/permissions";
import { stopOffer } from "@/server/offers/service";

const schema = z.object({ reason: z.string().min(3).max(300) }).strict();

/** POST /api/v1/admin/offers/{id}/stop {reason} — an admin with offers.manage stops any offer; the shop is notified. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    if (!hasPermission(actor, "offers.manage")) return apiError(404, "NOT_FOUND");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const { id } = await context.params;
    const result = await stopOffer(actor, id, body.data.reason);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
