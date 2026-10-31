import type { NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listAllMembershipPlans } from "@/server/memberships/service";

/** GET /api/v1/admin/membership-plans — Plus / Premium with price, tier and duration. Needs settings.view. */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk({ items: await listAllMembershipPlans(actor) });
  } catch (error) {
    return mapThrown(error);
  }
}
