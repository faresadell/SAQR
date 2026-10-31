import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson } from "@/server/api/http";
import { fileComplaint, listMyComplaints } from "@/server/complaints/service";

const schema = z.object({ orderId: z.string().min(8).max(64), subject: z.string().min(3).max(100), details: z.string().min(10).max(1000) }).strict();

/** GET /api/v1/complaints — the signed-in customer's complaints with the admin's response. */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk({ items: await listMyComplaints(actor) });
  } catch (error) {
    return mapThrown(error);
  }
}

/** POST /api/v1/complaints {orderId, subject, details} -> 201 {complaintId}. Only about your own order (another's id = 404). 429 when filing too many. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const result = await fileComplaint(actor, body.data);
    if (!result.ok) return apiError(result.error === "RATE_LIMITED" ? 429 : 422, result.error);
    return apiOk({ complaintId: result.complaintId }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
