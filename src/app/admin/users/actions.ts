"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { requirePermission } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { setUserStatus } from "@/server/users/service";

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
