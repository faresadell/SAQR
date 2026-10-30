import type { NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { getMyPlanState } from "@/server/plans/service";

/** GET /api/v1/plans/me — current subscription (plan, expiry) and the user's purchase history. */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk(await getMyPlanState(actor));
  } catch (error) {
    return mapThrown(error);
  }
}
