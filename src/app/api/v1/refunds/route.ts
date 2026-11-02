import type { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listRefunds } from "@/server/refunds/service";

/** GET /api/v1/refunds?status=PENDING|UNDER_REVIEW|COMPLETED — refunds you are owed (customer), owe (shop owner) or may verify (admin). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const status = request.nextUrl.searchParams.get("status");
    if (status !== null && status !== "PENDING" && status !== "UNDER_REVIEW" && status !== "COMPLETED") return apiError(422, "VALIDATION_FAILED", "status");
    return apiOk({ items: await listRefunds(actor, status ?? undefined) });
  } catch (error) {
    return mapThrown(error);
  }
}
