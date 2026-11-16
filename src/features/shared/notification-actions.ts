"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/guards";
import { markNotificationsRead, setGroupMuted } from "@/server/notifications/service";

/** Marks the signed-in user's own unread notifications as read. */
export async function markAllReadAction(): Promise<void> {
  const { user } = await requireUser();
  await markNotificationsRead(user, "all");
  for (const base of ["/account", "/merchant", "/driver"]) revalidatePath(base, "layout");
}

/** Switches one non-critical group of notifications off or on for the signed-in user. Critical kinds cannot be reached from here. */
export async function setMuteAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  await setGroupMuted(user, String(formData.get("group") ?? ""), formData.get("muted") === "1");
  for (const base of ["/account", "/merchant", "/driver"]) revalidatePath(base, "layout");
}
