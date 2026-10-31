import type { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listOffersForAdmin } from "@/server/offers/service";

/** GET /api/v1/admin/offers?state=ACTIVE|EXPIRED|STOPPED — all offers. Needs offers.manage. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const raw = request.nextUrl.searchParams.get("state");
    const state = raw === "ACTIVE" || raw === "EXPIRED" || raw === "STOPPED" ? raw : "ALL";
    return apiOk({ items: await listOffersForAdmin(actor, state) });
  } catch (error) {
    return mapThrown(error);
  }
}
