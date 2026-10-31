import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { createDriver, listMyDrivers } from "@/server/drivers/service";

const schema = z.object({ name: z.string().min(2).max(80), phone: z.string().min(8).max(20), password: z.string().min(8).max(100) }).strict();

/** GET /api/v1/drivers — the signed-in shop's own drivers. */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk({ items: await listMyDrivers(actor) });
  } catch (error) {
    return mapThrown(error);
  }
}

/** POST /api/v1/drivers {name, phone, password} — the shop creates a driver account tied to itself (201 {driverId}). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const result = await createDriver(actor, body.data);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ driverId: result.driverId }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
