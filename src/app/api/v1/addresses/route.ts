import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { createAddress, listMyAddresses } from "@/server/addresses/service";

const schema = z.object({ label: z.string().max(40).nullable().optional(), line: z.string().min(5).max(200), zoneId: z.string().min(1).max(64), lat: z.number().min(-90).max(90).nullable().optional(), lng: z.number().min(-180).max(180).nullable().optional() }).strict();

/** GET /api/v1/addresses — the signed-in customer's saved addresses. */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk({ items: await listMyAddresses(actor) });
  } catch (error) {
    return mapThrown(error);
  }
}

/** POST /api/v1/addresses {label?, line, zoneId, lat?, lng?} -> 201 {addressId}. zoneId must be an open delivery zone (fees depend on it). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const result = await createAddress(actor, body.data);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ addressId: result.addressId }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
