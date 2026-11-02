import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson } from "@/server/api/http";
import { setDriverActive } from "@/server/drivers/service";

const schema = z.object({ isActive: z.boolean() }).strict();

/** PATCH /api/v1/drivers/{id} {isActive} — pause or resume one of the shop's own drivers. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const { id } = await context.params;
    await setDriverActive(actor, id, body.data.isActive);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
