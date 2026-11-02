"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { assignDriver } from "@/server/orders/delivery";
import { advanceOrder, cancelOrder, confirmPayment, decideOrder, rejectPayment, resolveCancellation, type LifecycleResult } from "@/server/orders/lifecycle";
import { DENIED_ERROR, GENERIC_ERROR, LIFECYCLE_MESSAGES, NOT_FOUND_ERROR } from "@/features/shared/messages";

const ADVANCE = new Set(["PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]);

/**
 * One entry point for the shop's order buttons. `command` picks the existing service call; every rule
 * (ownership, state, payment confirmed first, stars) is enforced by the service, not here.
 */
export async function merchantOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  const get = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const orderId = get("orderId");
  const reason = get("reason");
  try {
    let result: LifecycleResult;
    switch (get("command")) {
      case "confirmPayment": result = await confirmPayment(user, orderId); break;
      case "rejectPayment": result = await rejectPayment(user, orderId, reason); break;
      case "approve": result = await decideOrder(user, orderId, "APPROVE"); break;
      case "reject": result = await decideOrder(user, orderId, "REJECT", reason); break;
      case "advance": {
        const to = get("to");
        if (!ADVANCE.has(to)) return { error: LIFECYCLE_MESSAGES.INVALID_REQUEST! };
        result = await advanceOrder(user, orderId, to as "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED");
        break;
      }
      case "assignDriver": result = await assignDriver(user, orderId, get("driverId")); break;
      case "cancel": result = await cancelOrder(user, orderId, reason); break;
      case "acceptCancellation": result = await resolveCancellation(user, orderId, "ACCEPT", reason); break;
      case "declineCancellation": result = await resolveCancellation(user, orderId, "DECLINE", reason); break;
      default: return { error: LIFECYCLE_MESSAGES.INVALID_REQUEST! };
    }
    if (!result.ok) return { error: LIFECYCLE_MESSAGES[result.error] ?? GENERIC_ERROR };
    revalidatePath("/merchant", "layout");
    return { message: "تم تنفيذ الإجراء." };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}
