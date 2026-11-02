import type { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { getOrderForActor } from "@/server/orders/read";

/** GET /api/v1/orders/{id} — one suborder, only if the caller is its customer, its shop owner, or an admin with orders.view. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const { id } = await context.params;
    return apiOk(await getOrderForActor(actor, id));
  } catch (error) {
    return mapThrown(error);
  }
}
