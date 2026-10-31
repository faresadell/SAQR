import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson } from "@/server/api/http";
import { countUnusedRecoveryCodes, generateRecoveryCodes } from "@/server/auth/admin-recovery";

const schema = z.object({ password: z.string().min(1).max(200) }).strict();

/** GET — how many unused backup codes the signed-in administrator still has. */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk({ unused: await countUnusedRecoveryCodes(actor) });
  } catch (error) {
    return mapThrown(error);
  }
}

/** POST {password} — creates 10 new single-use backup codes (returned ONCE; older ones stop working). Administrators only. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const result = await generateRecoveryCodes(actor, body.data.password, await getClientIp());
    if (!result.ok) return apiError(result.error === "RATE_LIMITED" ? 429 : 403, result.error);
    return apiOk({ codes: result.codes }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
