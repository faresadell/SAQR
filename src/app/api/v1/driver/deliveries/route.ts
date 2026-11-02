import type { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listMyDeliveries } from "@/server/orders/delivery";

/** GET /api/v1/driver/deliveries?scope=ACTIVE|HISTORY — the signed-in driver's own deliveries only. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const scope = request.nextUrl.searchParams.get("scope") === "HISTORY" ? "HISTORY" : "ACTIVE";
    return apiOk({ items: await listMyDeliveries(actor, scope) });
  } catch (error) {
    return mapThrown(error);
  }
}
