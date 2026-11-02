import type { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { merchantSalesReport } from "@/server/reports/service";

/** GET /api/v1/reports/sales?month=YYYY-MM — the signed-in shop's own monthly numbers (delivered orders, product sales, refunds, commission). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const report = await merchantSalesReport(actor, request.nextUrl.searchParams.get("month") ?? "");
    return report ? apiOk(report) : apiError(422, "INVALID_REQUEST");
  } catch (error) {
    return mapThrown(error);
  }
}
