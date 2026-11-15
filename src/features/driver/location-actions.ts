"use server";

import { requireRole } from "@/server/auth/guards";
import { AuthorizationError } from "@/server/errors";
import { shareLocation, stopSharing } from "@/server/drivers/location";

export type LocationActionResult = { ok: boolean; error?: string };

const MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "الموقع غير صالح.",
  NO_ACTIVE_DELIVERY: "لا يوجد طلب قيد التوصيل الآن.",
  RATE_LIMITED: "تحديثات كثيرة. حاول بعد قليل.",
};

export async function shareLocationAction(lat: number, lng: number, accuracyM?: number): Promise<LocationActionResult> {
  const { user } = await requireRole("DRIVER");
  try {
    const result = await shareLocation(user, Number(lat), Number(lng), accuracyM === undefined ? undefined : Number(accuracyM));
    return result.ok ? { ok: true } : { ok: false, error: MESSAGES[result.error] ?? "تعذّر تحديث الموقع." };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "غير مسموح." };
    console.error(error);
    return { ok: false, error: "تعذّر تحديث الموقع." };
  }
}

export async function stopSharingAction(): Promise<void> {
  const { user } = await requireRole("DRIVER");
  try {
    await stopSharing(user);
  } catch (error) {
    if (!(error instanceof AuthorizationError)) console.error(error);
  }
}
