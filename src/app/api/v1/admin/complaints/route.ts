import type { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listComplaintsForAdmin } from "@/server/complaints/service";

/** GET /api/v1/admin/complaints?status=OPEN|IN_REVIEW|RESOLVED|DISMISSED. Needs complaints.manage. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const raw = request.nextUrl.searchParams.get("status");
    const status = raw === "OPEN" || raw === "IN_REVIEW" || raw === "RESOLVED" || raw === "DISMISSED" ? raw : undefined;
    return apiOk({ items: await listComplaintsForAdmin(actor, status) });
  } catch (error) {
    return mapThrown(error);
  }
}
