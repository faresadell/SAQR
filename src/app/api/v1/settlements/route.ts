import type { NextRequest, NextResponse } from "next/server";
import { MONTH_KEY_PATTERN } from "@/lib/settlements/calc";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listSettlements } from "@/server/settlements/service";

/** GET /api/v1/settlements?month=YYYY-MM&status=ISSUED|PAID — shop owner: own statements; admin with settlements.manage: all. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const q = request.nextUrl.searchParams;
    const month = q.get("month");
    const status = q.get("status");
    if (month !== null && !MONTH_KEY_PATTERN.test(month)) return apiError(422, "VALIDATION_FAILED", "month");
    if (status !== null && status !== "ISSUED" && status !== "PAID") return apiError(422, "VALIDATION_FAILED", "status");
    return apiOk({ items: await listSettlements(actor, { monthKey: month ?? undefined, status: status ?? undefined }) });
  } catch (error) {
    return mapThrown(error);
  }
}
