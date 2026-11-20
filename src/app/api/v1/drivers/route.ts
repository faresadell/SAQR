import type { NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listDriversForShop } from "@/server/drivers/service";

/** GET /api/v1/drivers — drivers who are taking work, with their status (AVAILABLE / ON_TRIP), for the signed-in shop. */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk({ items: await listDriversForShop(actor) });
  } catch (error) {
    return mapThrown(error);
  }
}
