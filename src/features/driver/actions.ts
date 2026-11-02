"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { deliver, pickUp, reportFailure } from "@/server/orders/delivery";
import type { LifecycleResult } from "@/server/orders/lifecycle";
import { DENIED_ERROR, GENERIC_ERROR, LIFECYCLE_MESSAGES, NOT_FOUND_ERROR } from "@/features/shared/messages";

const DRIVER_MESSAGES: Record<string, string> = {
  ...LIFECYCLE_MESSAGES,
  WRONG_STATE: "لا يمكن تنفيذ هذا الإجراء الآن. قد لا يكون النشاط جهّز الطلب بعد.",
};

/** pickUp / deliver / reportFailure for the driver's own delivery. The service refuses anyone else's order. */
export async function driverDeliveryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("DRIVER");
  const get = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const orderId = get("orderId");
  try {
    let result: LifecycleResult;
    switch (get("command")) {
      case "pickUp": result = await pickUp(user, orderId); break;
      case "deliver": result = await deliver(user, orderId, { feeCollected: get("feeCollected") === "yes", note: get("note") }); break;
      case "fail": result = await reportFailure(user, orderId, get("note")); break;
      default: return { error: DRIVER_MESSAGES.INVALID_REQUEST! };
    }
    if (!result.ok) return { error: DRIVER_MESSAGES[result.error] ?? GENERIC_ERROR };
    revalidatePath("/driver", "layout");
    return { message: "تم تسجيل الإجراء." };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}
