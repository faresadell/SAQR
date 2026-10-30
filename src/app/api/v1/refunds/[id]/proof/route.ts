import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { submitRefundProof } from "@/server/refunds/service";

const schema = z.object({ uploadId: z.string().min(8).max(64) }).strict();

/** POST /api/v1/refunds/{id}/proof {uploadId} — the shop owner attaches the refund proof; the refund moves to UNDER_REVIEW. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const { id } = await context.params;
    const result = await submitRefundProof(actor, id, body.data.uploadId);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
