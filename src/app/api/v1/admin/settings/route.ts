import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson } from "@/server/api/http";
import { changeSetting, listSettingStates } from "@/server/settings/service";

const GROUPS = ["orders", "offers", "contest", "security"] as const;
const schema = z.object({ key: z.string().min(3).max(80), value: z.number().int().nullable(), effectiveFrom: z.string().max(40).nullable().optional() }).strict();

/** GET /api/v1/admin/settings?group=orders|offers|contest|security — current value, limits and scheduled changes. Needs settings.view. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const raw = request.nextUrl.searchParams.get("group") ?? "orders";
    const group = GROUPS.find((g) => g === raw);
    if (!group) return apiError(422, "INVALID_REQUEST");
    return apiOk({ items: await listSettingStates(actor, group) });
  } catch (error) {
    return mapThrown(error);
  }
}

/**
 * POST /api/v1/admin/settings {key, value, effectiveFrom?} — schedule a new value (null clears a nullable one). Needs settings.manage.
 * effectiveFrom is an ISO instant in the future (default: now). History is append-only; old orders are never recalculated.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const result = await changeSetting(actor, body.data.key, body.data.value === null ? "" : String(body.data.value), body.data.effectiveFrom ?? null);
    if (!result.ok) return apiError(422, result.error);
    return apiOk({ effectiveFrom: result.effectiveFrom });
  } catch (error) {
    return mapThrown(error);
  }
}
