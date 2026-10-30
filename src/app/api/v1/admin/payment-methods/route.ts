import type { NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { listPaymentMethods } from "@/server/payments/methods";

/** GET /api/v1/admin/payment-methods — every method with its switch and receiving number. Needs settings.view or settings.manage. */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    return apiOk({ items: await listPaymentMethods(actor) });
  } catch (error) {
    return mapThrown(error);
  }
}
