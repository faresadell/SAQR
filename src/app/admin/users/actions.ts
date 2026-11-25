"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { requirePermission } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { setUserStatus } from "@/server/users/service";
import { createDriverByAdmin } from "@/server/users/create-driver";

const schema = z.object({
  userId: z.string().min(1).max(64),
  next: z.enum(["ACTIVE", "SUSPENDED"]),
  reason: z.string().trim().min(3).max(300),
});

export async function setUserStatusAction(formData: FormData): Promise<void> {
  // Re-check authorization inside the action: hidden buttons are not security.
  const actor = await requirePermission("users.manage");

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/users?notice=invalid");

  let notice = "done";
  try {
    await setUserStatus(actor, parsed.data.userId, parsed.data.next, parsed.data.reason, await getClientIp());
  } catch (error) {
    if (error instanceof AuthorizationError) notice = "forbidden";
    else if (error instanceof NotFoundError) notice = "missing";
    else throw error;
  }
  revalidatePath("/admin/users");
  redirect(`/admin/users?notice=${notice}`);
}

const driverSchema = z.object({
  name: z.string().max(80),
  phone: z.string().max(30),
  email: z.string().max(200),
  password: z.string().max(200),
  vehicleType: z.string().max(30),
});

const driverNotices = {
  INVALID_NAME: "driver_name",
  INVALID_VEHICLE: "driver_vehicle",
  INVALID_PHONE: "driver_phone",
  INVALID_EMAIL: "driver_email",
  WEAK_PASSWORD: "driver_password",
  PHONE_TAKEN: "driver_phone_taken",
  EMAIL_TAKEN: "driver_email_taken",
} as const;

/** Drivers cannot sign themselves up: an administrator opens the account and hands over the temporary password. */
export async function createDriverAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("users.manage");
  const parsed = driverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/users?notice=invalid");

  let notice = "driver_created";
  try {
    const result = await createDriverByAdmin(actor, parsed.data, await getClientIp());
    if (!result.ok) notice = driverNotices[result.error];
  } catch (error) {
    if (error instanceof AuthorizationError) notice = "forbidden";
    else throw error;
  }
  revalidatePath("/admin/users");
  redirect(`/admin/users?notice=${notice}`);
}
