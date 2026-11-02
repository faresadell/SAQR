import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, checkOrigin, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { deleteAddress, updateAddress } from "@/server/addresses/service";

const schema = z.object({ label: z.string().max(40).nullable().optional(), line: z.string().min(5).max(200).optional(), zoneId: z.string().min(1).max(64).optional(), lat: z.number().min(-90).max(90).nullable().optional(), lng: z.number().min(-180).max(180).nullable().optional() }).strict();

/** PATCH /api/v1/addresses/{id} — edit your own address (orders already placed keep the address they were placed with). */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const { id } = await context.params;
    const result = await updateAddress(actor, id, body.data);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}

/** DELETE /api/v1/addresses/{id} */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const bad = checkOrigin(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const { id } = await context.params;
    await deleteAddress(actor, id);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
