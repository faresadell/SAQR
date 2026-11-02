import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson } from "@/server/api/http";
import { startEmailVerification } from "@/server/auth/email-account";

const schema = z.object({ email: z.string().min(5).max(254) }).strict();

/**
 * POST /api/v1/account/email {email} — emails a 6-digit code (valid 10 minutes). Answers {ok:true} even when the address belongs
 * to someone else (nothing is sent then). 409 ALREADY_VERIFIED, 422 INVALID_REQUEST, 429 RATE_LIMITED, 502 SEND_FAILED.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const result = await startEmailVerification(actor, body.data.email, await getClientIp());
    if (!result.ok) return apiError({ INVALID_REQUEST: 422, RATE_LIMITED: 429, SEND_FAILED: 502, ALREADY_VERIFIED: 409 }[result.error], result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
