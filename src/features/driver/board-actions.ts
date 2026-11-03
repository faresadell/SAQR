"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { claimOrder, releaseOrder } from "@/server/orders/driver-board";
import { DENIED_ERROR, GENERIC_ERROR, NOT_FOUND_ERROR } from "@/features/shared/messages";

/** Accept an order from the open board, or give an accepted (not yet picked up) one back. */
export async function boardAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("DRIVER");
  const orderId = String(formData.get("orderId") ?? "").trim();
  const command = String(formData.get("command") ?? "");
  if (orderId.length < 1 || orderId.length > 64) return { error: GENERIC_ERROR };
  try {
    if (command === "claim") {
      const result = await claimOrder(user, orderId);
      revalidatePath("/driver", "layout");
      if (result.ok) return { message: "قبلت الطلب. تابعه من «الطلبات المسندة»." };
      if (result.error === "TAKEN") return { error: result.takenBy ? `سبقك السائق ${result.takenBy} وقبل هذا الطلب.` : "سبقك سائق آخر وقبل هذا الطلب." };
      return { error: "هذا الطلب لم يعد متاحاً." };
    }
    if (command === "release") {
      const result = await releaseOrder(user, orderId);
      revalidatePath("/driver", "layout");
      return result.ok ? { message: "أُعيد الطلب لقائمة السائقين." } : { error: "لا يمكن التراجع بعد استلام الطلب." };
    }
    return { error: GENERIC_ERROR };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}
