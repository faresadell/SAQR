import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { MUTABLE_GROUPS, mutableTypes } from "@/lib/notifications/mutable";
import { isEmailedType, scheduleEmailFlush } from "@/server/notifications/email";

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
  // Respect a user's choice to mute a non-critical kind (the mute table only ever holds those kinds).
  const mutes = await tx.notificationMute.findMany({ where: { userId: { in: [...new Set(items.map((n) => n.userId))] }, type: { in: [...new Set(items.map((n) => n.type))] } }, select: { userId: true, type: true } });
  const muted = new Set(mutes.map((m) => `${m.userId}:${m.type}`));
  const wanted = items.filter((n) => !muted.has(`${n.userId}:${n.type}`));
  if (wanted.length === 0) return;
  await tx.notification.createMany({
    data: wanted.map((n) => ({ userId: n.userId, type: n.type, title: n.title, body: n.body, dedupeKey: n.dedupeKey, ...(n.data !== undefined ? { data: n.data } : {}) })),
    skipDuplicates: true,
  });
  if (wanted.some((n) => isEmailedType(n.type))) scheduleEmailFlush(); // email copy, sent after the response (the row is already in this transaction)
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

/** Which groups of non-critical notifications this user has switched off. */
export async function listMyMutedGroups(actor: Actor): Promise<string[]> {
  const rows = await db.notificationMute.findMany({ where: { userId: actor.id }, select: { type: true } });
  const muted = new Set(rows.map((r) => r.type));
  return MUTABLE_GROUPS.filter((g) => g.types.every((t) => muted.has(t))).map((g) => g.key);
}

/** Switch a non-critical group off or on for the caller. Unknown groups (including every critical kind) are refused. */
export async function setGroupMuted(actor: Actor, groupKey: string, muted: boolean): Promise<{ ok: boolean }> {
  const types = mutableTypes(groupKey);
  if (types.length === 0) return { ok: false };
  if (muted) await db.notificationMute.createMany({ data: types.map((type) => ({ userId: actor.id, type })), skipDuplicates: true });
  else await db.notificationMute.deleteMany({ where: { userId: actor.id, type: { in: [...types] } } });
  return { ok: true };
}
