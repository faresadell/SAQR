import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson } from "@/server/api/http";
import { approveLegalPage, updateLegalPage } from "@/server/legal/service";

const editSchema = z.object({ action: z.literal("edit"), title: z.string().min(1).max(120), body: z.string().min(1).max(20000), expectedVersion: z.number().int().min(1) }).strict();
const approveSchema = z.object({ action: z.literal("approve"), expectedVersion: z.number().int().min(1) }).strict();
const schema = z.union([editSchema, approveSchema]);

/**
 * POST /api/v1/admin/legal/{slug} — needs content.manage.
 * {action:"edit", title, body, expectedVersion} → new version, approval removed. {action:"approve", expectedVersion} → approves exactly that version.
 * 409 STALE_VERSION when someone changed the page first.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const { slug } = await context.params;
    const result = body.data.action === "edit" ? await updateLegalPage(actor, slug, body.data) : await approveLegalPage(actor, slug, body.data.expectedVersion);
    if (!result.ok) return apiError(result.error === "STALE_VERSION" ? 409 : 422, result.error);
    return apiOk({ version: result.version });
  } catch (error) {
    return mapThrown(error);
  }
}
