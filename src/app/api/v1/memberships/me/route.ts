import type { NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { getMyMembership } from "@/server/memberships/service";

/** GET /api/v1/memberships/me -> {tier, membership:{plan,tier,startsAt,expiresAt,isActive}|null, purchases:[...]} (shop owner). */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk(await getMyMembership(actor));
  } catch (error) {
    return mapThrown(error);
  }
}
