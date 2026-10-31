import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson } from "@/server/api/http";
import { confirmEmailVerification } from "@/server/auth/email-account";

const schema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

/** POST /api/v1/account/email/confirm {code} → {email}. 422 INVALID_CODE, 409 EMAIL_TAKEN, 429 RATE_LIMITED. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const result = await confirmEmailVerification(actor, body.data.code, await getClientIp());
    if (!result.ok) return apiError({ INVALID_CODE: 422, INVALID_REQUEST: 422, EMAIL_TAKEN: 409, RATE_LIMITED: 429 }[result.error], result.error);
    return apiOk({ email: result.email });
  } catch (error) {
    return mapThrown(error);
  }
}
