import type { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listMyNotifications } from "@/server/notifications/service";

/** GET /api/v1/notifications?cursor=&limit=&unread=1 -> {items, nextCursor, unreadCount} (the caller's own inbox). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const q = request.nextUrl.searchParams;
    const limit = Number(q.get("limit") ?? "20");
    if (!Number.isInteger(limit)) return apiError(422, "VALIDATION_FAILED", "limit");
    return apiOk(await listMyNotifications(actor, { cursor: q.get("cursor") ?? undefined, limit, unreadOnly: q.get("unread") === "1" }));
  } catch (error) {
    return mapThrown(error);
  }
}
