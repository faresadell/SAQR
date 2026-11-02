import type { NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listMyAwards } from "@/server/contest/service";

/** GET /api/v1/contest/awards — the signed-in user's own approved or paid contest wins. */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk({ items: await listMyAwards(actor) });
  } catch (error) {
    return mapThrown(error);
  }
}
