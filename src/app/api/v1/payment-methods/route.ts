import type { NextResponse } from "next/server";
import { apiError, apiOk, currentActor, mapThrown } from "@/server/api/http";
import { getEnabledPaymentMethods } from "@/server/payments/methods";

/** GET /api/v1/payment-methods — methods a user can pay with now (enabled AND receiving number set), with the number to send to. */
export async function GET(): Promise<NextResponse> {
  try {
    if (!(await currentActor())) return apiError(401, "UNAUTHENTICATED");
    return apiOk({ items: await getEnabledPaymentMethods() });
  } catch (error) {
    return mapThrown(error);
  }
}
