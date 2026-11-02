import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { listAwards, proposeAward } from "@/server/contest/service";

const schema = z.object({ monthKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), rank: z.number().int().min(1).max(3), userId: z.string().min(8).max(64), basisNote: z.string().min(10).max(500) }).strict();

/** GET /api/v1/admin/contest/awards?month=YYYY-MM — awards in any state. Needs contest.manage. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const month = request.nextUrl.searchParams.get("month") ?? undefined;
    return apiOk({ items: await listAwards(actor, month) });
  } catch (error) {
    return mapThrown(error);
  }
}

/**
 * POST /api/v1/admin/contest/awards {monthKey, rank, userId, basisNote} — propose a winner for a CLOSED month.
 * The ranking rule is not defined, so the admin states the basis. 409 RANK_TAKEN | ALREADY_RANKED | MONTH_NOT_CLOSED | USER_NOT_ELIGIBLE.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const result = await proposeAward(actor, body.data);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ awardId: result.awardId }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
