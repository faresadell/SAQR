"use server";

import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { sendNoticeEmail } from "@/lib/email/resend";
import { requireRole } from "@/server/auth/guards";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";

/** Sends one plain test email to the signed-in admin's own address, so the provider setup is proven end to end. */
export async function sendTestEmailAction(): Promise<void> {
  const { user } = await requireRole("ADMIN");
  const env = getEnv();
  const account = await db.user.findUnique({ where: { id: user.id }, select: { email: true } });
  let result = "noaddress";
  if (account?.email) {
    if (env.EMAIL_PROVIDER !== "resend" || !env.RESEND_API_KEY || !env.EMAIL_FROM) {
      result = "notresend";
    } else {
      try {
        await sendNoticeEmail({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }, account.email, "SAQR: رسالة تجربة", "هذه رسالة تجربة من لوحة الأدمن. لو وصلتك فالإيميل شغال.", (url, init) => fetch(url, init));
        result = "sent";
      } catch (error) {
        result = `failed:${(error instanceof Error ? error.message : "unknown").slice(0, 80)}`;
      }
    }
    await writeAudit({ actorId: user.id, action: "EMAIL_TEST", entityType: "User", entityId: user.id, after: { result: result.split(":")[0] } });
  }
  redirect(`/admin/system?mail=${encodeURIComponent(result)}`);
}
