import type { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listAuditLog } from "@/server/audit/read";

const date = (v: string | null): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** GET /api/v1/admin/audit?action=&entityType=&entityId=&actorId=&from=&to=&cursor=&limit= — newest first. Needs audit.view. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const q = request.nextUrl.searchParams;
    const limit = Number(q.get("limit") ?? 50);
    return apiOk(await listAuditLog(actor, {
      action: q.get("action") ?? undefined,
      entityType: q.get("entityType") ?? undefined,
      entityId: q.get("entityId") ?? undefined,
      actorId: q.get("actorId") ?? undefined,
      from: date(q.get("from")),
      to: date(q.get("to")),
      cursor: q.get("cursor") ?? undefined,
      limit: Number.isFinite(limit) ? limit : 50,
    }));
  } catch (error) {
    return mapThrown(error);
  }
}
