import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson } from "@/server/api/http";
import { markNotificationsRead } from "@/server/notifications/service";

const schema = z.union([z.object({ all: z.literal(true) }).strict(), z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(100) }).strict()]);

/** POST /api/v1/notifications/read {ids:[...]} or {all:true} -> {updated}. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    return apiOk(await markNotificationsRead(actor, "all" in body.data ? "all" : body.data.ids));
  } catch (error) {
    return mapThrown(error);
  }
}
