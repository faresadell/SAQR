"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/guards";
import { setMyAvailability } from "@/server/drivers/service";
import { AuthorizationError } from "@/server/errors";

/** The driver says they are taking work (or not). Merchants see the result on «اطلب سائق». */
export async function setAvailabilityAction(formData: FormData): Promise<void> {
  const { user } = await requireRole("DRIVER");
  try {
    await setMyAvailability(user, formData.get("online") === "true");
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
  }
  revalidatePath("/driver", "layout");
  revalidatePath("/merchant/drivers");
}
