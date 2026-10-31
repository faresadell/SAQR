import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson } from "@/server/api/http";
import { createZone, listZones } from "@/server/delivery/zones";

const schema = z.object({ name: z.string().min(2).max(80), feeCents: z.number().int() }).strict();

/** GET /api/v1/admin/zones — delivery zones with current and scheduled fees. Needs settings.view. */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk({ items: await listZones(actor) });
  } catch (error) {
    return mapThrown(error);
  }
}

/** POST /api/v1/admin/zones {name, feeCents} — add a zone with its first fee. Needs settings.manage. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const result = await createZone(actor, body.data.name, body.data.feeCents);
    if (!result.ok) return apiError(422, result.error);
    return apiOk({ ok: true }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
