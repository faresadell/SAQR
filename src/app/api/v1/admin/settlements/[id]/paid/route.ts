import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasPermission } from "@/lib/auth/permissions";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { markSettlementPaid } from "@/server/settlements/service";

const schema = z.object({ reference: z.string().min(3).max(64) }).strict();

/** POST /api/v1/admin/settlements/{id}/paid {reference} — records that the commission was received (once). Needs settlements.manage. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    if (!hasPermission(actor, "settlements.manage")) return apiError(404, "NOT_FOUND");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const { id } = await context.params;
    const result = await markSettlementPaid(actor, id, body.data.reference);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
