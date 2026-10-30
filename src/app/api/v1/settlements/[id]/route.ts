import type { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { getSettlement } from "@/server/settlements/service";

/** GET /api/v1/settlements/{id} — one statement with its lines (own shop, or admin with settlements.manage). */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const { id } = await context.params;
    return apiOk(await getSettlement(actor, id));
  } catch (error) {
    return mapThrown(error);
  }
}
