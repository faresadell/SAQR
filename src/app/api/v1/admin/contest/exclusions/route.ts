import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, checkOrigin, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { excludeParticipant, restoreParticipant } from "@/server/contest/service";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const excludeSchema = z.object({ monthKey: month, userId: z.string().min(8).max(64), reason: z.string().min(3).max(300) }).strict();

/** POST /api/v1/admin/contest/exclusions {monthKey, userId, reason} — removes a participant from that month's ranking (and rejects their proposed award). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, excludeSchema);
    if (!body.ok) return body.response;
    const result = await excludeParticipant(actor, body.data.monthKey, body.data.userId, body.data.reason);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ ok: true }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}

/** DELETE /api/v1/admin/contest/exclusions?month=YYYY-MM&userId=... — restores a wrongly excluded participant. */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkOrigin(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const monthKey = request.nextUrl.searchParams.get("month") ?? "";
    const userId = request.nextUrl.searchParams.get("userId") ?? "";
    const result = await restoreParticipant(actor, monthKey, userId);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
