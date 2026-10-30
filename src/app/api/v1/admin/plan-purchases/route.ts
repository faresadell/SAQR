import type { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/auth/permissions";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listPurchasesForReview } from "@/server/plans/service";

/** GET /api/v1/admin/plan-purchases?status=PENDING|APPROVED|REJECTED — admins with payments.review. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor || !hasPermission(actor, "payments.review")) return apiError(actor ? 404 : 401, actor ? "NOT_FOUND" : "UNAUTHENTICATED");
    const status = request.nextUrl.searchParams.get("status") ?? "PENDING";
    if (status !== "PENDING" && status !== "APPROVED" && status !== "REJECTED") return apiError(422, "VALIDATION_FAILED", "status");
    return apiOk({ items: await listPurchasesForReview(actor, status) });
  } catch (error) {
    return mapThrown(error);
  }
}
