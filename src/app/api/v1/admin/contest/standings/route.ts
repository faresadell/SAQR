import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { getStandings, proposeFromStandings } from "@/server/contest/service";

const proposeSchema = z.object({ monthKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict();

/** GET /api/v1/admin/contest/standings?month=YYYY-MM&limit=20 — ranking from real delivered orders (a preview while the month is open). Needs contest.manage. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const month = request.nextUrl.searchParams.get("month") ?? "";
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "20");
    const view = await getStandings(actor, month, Number.isFinite(limit) ? limit : 20);
    if (!view) return apiError(422, "INVALID_REQUEST");
    return apiOk(view);
  } catch (error) {
    return mapThrown(error);
  }
}

/**
 * POST /api/v1/admin/contest/standings {monthKey} — proposes the top three of a CLOSED month for review.
 * 409 CONTEST_NOT_ENABLED | RULES_NOT_APPROVED | MONTH_NOT_CLOSED | AWARDS_EXIST | NOT_ENOUGH_PARTICIPANTS.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, proposeSchema);
    if (!body.ok) return body.response;
    const result = await proposeFromStandings(actor, body.data.monthKey);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ awardIds: result.awardIds }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
