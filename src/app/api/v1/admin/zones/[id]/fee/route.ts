import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson } from "@/server/api/http";
import { scheduleZoneFee } from "@/server/delivery/zones";

const schema = z.object({ feeCents: z.number().int(), effectiveFrom: z.string().max(40).nullable().optional() }).strict();

/** POST /api/v1/admin/zones/{id}/fee {feeCents, effectiveFrom?} — schedule a new fee; existing orders keep the fee they were created with. Needs settings.manage. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const { id } = await context.params;
    const result = await scheduleZoneFee(actor, id, body.data.feeCents, body.data.effectiveFrom ?? null);
    if (!result.ok) return apiError(422, result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
