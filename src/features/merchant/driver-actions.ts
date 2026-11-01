"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/auth/guards";
import { createDriver, setDriverActive } from "@/server/drivers/service";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { DENIED_ERROR, DRIVER_MESSAGES, GENERIC_ERROR, NOT_FOUND_ERROR } from "@/features/shared/messages";

const get = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
};

export async function createDriverAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  try {
    const result = await createDriver(user, { name: get(formData, "name"), phone: get(formData, "phone"), password: get(formData, "password") });
    if (!result.ok) return { error: DRIVER_MESSAGES[result.error] ?? GENERIC_ERROR };
    revalidatePath("/merchant/drivers");
    return { message: "تم إنشاء حساب السائق. سيؤكد رقمه بكود عند أول دخول." };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}

export async function setDriverActiveAction(formData: FormData): Promise<void> {
  const { user } = await requireRole("MERCHANT");
  try {
    await setDriverActive(user, get(formData, "driverId"), get(formData, "isActive") === "true");
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  revalidatePath("/merchant/drivers");
}
