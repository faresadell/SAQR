import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasPermission } from "@/lib/auth/permissions";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { reviewRefund } from "@/server/refunds/service";

const schema = z.object({ decision: z.enum(["VERIFY", "REJECT_PROOF"]), note: z.string().min(3).max(300).optional() }).strict();

/** POST /api/v1/admin/refunds/{id} {decision: VERIFY|REJECT_PROOF, note?} — needs refunds.verify. REJECT_PROOF requires a note. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    if (!hasPermission(actor, "refunds.verify")) return apiError(404, "NOT_FOUND");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const { id } = await context.params;
    const result = await reviewRefund(actor, id, body.data.decision, body.data.note);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
