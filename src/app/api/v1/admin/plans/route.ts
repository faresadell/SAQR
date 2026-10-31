import type { NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listAllPlans } from "@/server/plans/service";

/** GET /api/v1/admin/plans — every star package (also those off sale). Needs settings.view. */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk({ items: await listAllPlans(actor) });
  } catch (error) {
    return mapThrown(error);
  }
}
