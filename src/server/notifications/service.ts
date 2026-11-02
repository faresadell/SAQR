import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";

export interface NewNotification {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
  /** Same key = same notification. Build it from the event (e.g. `order-approved:<orderId>`). */
  dedupeKey: string;
}

/** Writes in the caller's transaction. A repeated dedupeKey is silently ignored (retry-safe). */
export async function notifyInTx(tx: Prisma.TransactionClient, ...items: NewNotification[]): Promise<void> {
  if (items.length === 0) return;
  await tx.notification.createMany({
    data: items.map((n) => ({ userId: n.userId, type: n.type, title: n.title, body: n.body, dedupeKey: n.dedupeKey, ...(n.data !== undefined ? { data: n.data } : {}) })),
    skipDuplicates: true,
  });
}

const select = { id: true, type: true, title: true, body: true, data: true, readAt: true, createdAt: true } satisfies Prisma.NotificationSelect;

/** Own notifications only, newest first. */
export async function listMyNotifications(actor: Actor, opts: { cursor?: string; limit?: number; unreadOnly?: boolean } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const rows = await db.notification.findMany({
    where: { userId: actor.id, ...(opts.unreadOnly ? { readAt: null } : {}) },
    select,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, limit);
  const unreadCount = await db.notification.count({ where: { userId: actor.id, readAt: null } });
  return { items, nextCursor: rows.length > limit ? (items[items.length - 1]?.id ?? null) : null, unreadCount };
}

/** Marks the caller's own notifications read (ids that belong to someone else are ignored, never an error that reveals them). */
export async function markNotificationsRead(actor: Actor, ids: string[] | "all"): Promise<{ updated: number }> {
  const result = await db.notification.updateMany({
    where: { userId: actor.id, readAt: null, ...(ids === "all" ? {} : { id: { in: ids.slice(0, 100) } }) },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}
