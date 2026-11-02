import type { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { platformSalesReport } from "@/server/reports/service";

/** GET /api/v1/admin/reports/sales?month=YYYY-MM — platform-wide numbers for the month. Needs orders.view. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const report = await platformSalesReport(actor, request.nextUrl.searchParams.get("month") ?? "");
    return report ? apiOk(report) : apiError(422, "INVALID_REQUEST");
  } catch (error) {
    return mapThrown(error);
  }
}
