import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { apiError, apiOk, checkMutation, mapThrown, readJson } from "@/server/api/http";
import { requestPasswordResetByEmail } from "@/server/auth/email-account";
import { requestPasswordReset } from "@/server/auth/password-reset";

const schema = z
  .object({ phone: z.string().min(8).max(20).optional(), email: z.string().min(5).max(254).optional() })
  .strict()
  .refine((v) => (v.phone === undefined) !== (v.email === undefined), "send exactly one of phone or email");

/**
 * POST /api/v1/auth/password-reset/request {phone} OR {email} — sends a 6-digit code (SMS needs an SMS provider; email needs a verified address on the account).
 * ALWAYS answers {ok:true} (never reveals whether the number is registered). 429 when throttled, 422 for a malformed number.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const ip = await getClientIp();
    const result = body.data.email !== undefined ? await requestPasswordResetByEmail(body.data.email, ip) : await requestPasswordReset(body.data.phone!, ip);
    if (!result.ok) return apiError(result.error === "RATE_LIMITED" ? 429 : 422, result.error);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
