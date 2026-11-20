import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sendNoticeEmail } from "@/lib/email/resend";

/** Kinds that are also sent by email: everything about orders, payments, deliveries, refunds and settlements. Chat, reviews and offers stay in the app. */
const EMAILED = /^(ORDER_|PAYMENT_|DELIVERY_|REFUND_|SETTLEMENT_)/;
export const isEmailedType = (type: string): boolean => EMAILED.test(type);

const MAX_TRIES = 3;
const WINDOW_HOURS = 24;

export interface NoticeSender {
  /** Returns false when no provider is configured (nothing is marked as sent). Throws when the provider refuses. */
  send(to: string, subject: string, text: string): Promise<boolean>;
}

class EnvNoticeSender implements NoticeSender {
  async send(to: string, subject: string, text: string): Promise<boolean> {
    const env = getEnv();
    if (env.EMAIL_PROVIDER === "disabled") return false;
    if (env.EMAIL_PROVIDER === "console") {
      console.info(`[DEV ONLY] notification email to ${to}: ${subject}`);
      return true;
    }
    await sendNoticeEmail({ apiKey: env.RESEND_API_KEY!, from: env.EMAIL_FROM! }, to, subject, text, (url, init) => fetch(url, init));
    return true;
  }
}

let override: NoticeSender | undefined;
export function setNoticeSenderForTests(sender: NoticeSender | undefined): void {
  override = sender;
}

/**
 * Sends the email copy of recent notifications to users who have a verified email. A row is claimed (tries + 1) before sending, so two
 * overlapping runs never send twice, and a row that keeps failing is given up after a few tries. Safe to call as often as you like.
 */
export async function flushNotificationEmails(limit = 50): Promise<{ sent: number; failed: number }> {
  const sender = override ?? new EnvNoticeSender();
  const rows = await db.notification.findMany({
    where: { emailedAt: null, emailTries: { lt: MAX_TRIES }, createdAt: { gte: new Date(Date.now() - WINDOW_HOURS * 3_600_000) }, user: { status: "ACTIVE", email: { not: null }, emailVerifiedAt: { not: null } } },
    orderBy: { createdAt: "asc" },
    take: limit * 4,
    select: { id: true, type: true, title: true, body: true, emailTries: true, user: { select: { email: true } } },
  });
  let sent = 0;
  let failed = 0;
  for (const row of rows.filter((r) => isEmailedType(r.type)).slice(0, limit)) {
    const claim = await db.notification.updateMany({ where: { id: row.id, emailedAt: null, emailTries: row.emailTries }, data: { emailTries: { increment: 1 } } });
    if (claim.count !== 1 || !row.user.email) continue;
    try {
      const text = `${row.body}\n\nافتح صقر: ${getEnv().APP_URL}`;
      if (!(await sender.send(row.user.email, row.title, text))) continue;
      await db.notification.update({ where: { id: row.id }, data: { emailedAt: new Date() } });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("notification email failed", error instanceof Error ? error.message : "unknown"); // never log the address or the key
    }
  }
  return { sent, failed };
}

/** Run a background task after the response was sent (falls back to fire-and-forget outside a request). Never in tests. */
export function runSoon(task: () => Promise<unknown>): void {
  if (process.env.VITEST) return;
  const safe = () => task().catch((error: unknown) => console.error("background task failed", error instanceof Error ? error.message : "unknown"));
  try {
    after(safe);
  } catch {
    void safe();
  }
}

export function scheduleEmailFlush(): void {
  runSoon(() => flushNotificationEmails());
}
