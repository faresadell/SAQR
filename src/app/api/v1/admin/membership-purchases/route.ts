import type { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/auth/permissions";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listMembershipPurchasesForReview } from "@/server/memberships/service";

/** GET /api/v1/admin/membership-purchases?status=PENDING|APPROVED|REJECTED — admins with payments.review. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    if (!hasPermission(actor, "payments.review")) return apiError(404, "NOT_FOUND");
    const status = request.nextUrl.searchParams.get("status") ?? "PENDING";
    if (status !== "PENDING" && status !== "APPROVED" && status !== "REJECTED") return apiError(422, "VALIDATION_FAILED", "status");
    return apiOk({ items: await listMembershipPurchasesForReview(actor, status) });
  } catch (error) {
    return mapThrown(error);
  }
}
