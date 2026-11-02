import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { apiError, apiOk, checkMutation, mapThrown, readJson } from "@/server/api/http";
import { confirmPasswordResetByEmail } from "@/server/auth/email-account";
import { confirmPasswordReset } from "@/server/auth/password-reset";

const schema = z
  .object({ phone: z.string().min(8).max(20).optional(), email: z.string().min(5).max(254).optional(), code: z.string().regex(/^\d{6}$/), newPassword: z.string().min(8).max(200) })
  .strict()
  .refine((v) => (v.phone === undefined) !== (v.email === undefined), "send exactly one of phone or email");

/**
 * POST /api/v1/auth/password-reset/confirm {phone|email, code, newPassword} — sets the new password and signs out all devices.
 * 422 INVALID_CODE (wrong/expired) | WEAK_PASSWORD (with `problem`) | INVALID_REQUEST, 429 RATE_LIMITED. Administrators cannot use this.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const ip = await getClientIp();
    const result =
      body.data.email !== undefined
        ? await confirmPasswordResetByEmail(body.data.email, body.data.code, body.data.newPassword, ip)
        : await confirmPasswordReset(body.data.phone!, body.data.code, body.data.newPassword, ip);
    if (!result.ok) return apiError(result.error === "RATE_LIMITED" ? 429 : 422, result.error, result.problem);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
