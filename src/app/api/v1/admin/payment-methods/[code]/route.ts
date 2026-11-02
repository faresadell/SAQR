import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { setPaymentMethodEnabled, setPaymentReceiver } from "@/server/payments/methods";

const schema = z.object({ enabled: z.boolean().optional(), receiverNumber: z.string().max(30).nullable().optional() }).strict();

/** PATCH /api/v1/admin/payment-methods/{code} {enabled?, receiverNumber?} — needs settings.manage. receiverNumber null clears it. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const { code } = await context.params;
    if (body.data.receiverNumber !== undefined) {
      const r = await setPaymentReceiver(actor, code, body.data.receiverNumber);
      if (!r.ok) return apiError(statusForCode(r.error), r.error);
    }
    if (body.data.enabled !== undefined) await setPaymentMethodEnabled(actor, code, body.data.enabled);
    return apiOk({ ok: true });
  } catch (error) {
    return mapThrown(error);
  }
}
