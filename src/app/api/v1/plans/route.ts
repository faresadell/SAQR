import type { NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listPlansFor } from "@/server/plans/service";

/** GET /api/v1/plans — the star plans the signed-in user may buy (customers, drivers or merchants see their own set). */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk({ items: await listPlansFor(actor) });
  } catch (error) {
    return mapThrown(error);
  }
}
