"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/guards";
import { markNotificationsRead } from "@/server/notifications/service";

/** Marks the signed-in user's own unread notifications as read. */
export async function markAllReadAction(): Promise<void> {
  const { user } = await requireUser();
  await markNotificationsRead(user, "all");
  for (const base of ["/account", "/merchant", "/driver"]) revalidatePath(base, "layout");
}
