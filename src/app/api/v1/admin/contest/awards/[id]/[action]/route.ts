import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { approveAward, markAwardPaid, rejectAward, type ContestResult } from "@/server/contest/service";

const schemas = {
  approve: z.object({}).strict(),
  reject: z.object({ reason: z.string().min(3).max(300) }).strict(),
  paid: z.object({ reference: z.string().min(3).max(64) }).strict(),
} as const;
type Action = keyof typeof schemas;
const isAction = (value: string): value is Action => Object.hasOwn(schemas, value);

/** POST /api/v1/admin/contest/awards/{id}/{approve|reject|paid} — needs contest.manage. Each step happens once (409 WRONG_STATE). */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; action: string }> }): Promise<NextResponse> {
  try {
    const { id, action } = await context.params;
    if (!isAction(action)) return apiError(404, "NOT_FOUND");
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schemas[action]);
    if (!body.ok) return body.response;
    let result: ContestResult;
    if (action === "approve") result = await approveAward(actor, id);
    else if (action === "reject") result = await rejectAward(actor, id, (body.data as z.infer<typeof schemas.reject>).reason);
    else result = await markAwardPaid(actor, id, (body.data as z.infer<typeof schemas.paid>).reference);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
