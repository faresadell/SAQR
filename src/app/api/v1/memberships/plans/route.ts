import type { NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listMembershipPlans } from "@/server/memberships/service";

/** GET /api/v1/memberships/plans -> {items:[{code,nameAr,priceCents,tier,durationDays}]}. Merchant memberships (Plus / Premium). */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    if (actor.role !== "MERCHANT") return apiError(403, "FORBIDDEN");
    return apiOk({ items: await listMembershipPlans() });
  } catch (error) {
    return mapThrown(error);
  }
}
