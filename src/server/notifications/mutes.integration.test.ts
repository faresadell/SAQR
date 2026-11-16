/**
 * Notification mute integration tests (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { listMyMutedGroups, notifyInTx, setGroupMuted } from "@/server/notifications/service";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

let n = 0;
async function user() {
  n += 1;
  const u = await db.user.create({ data: { phone: `+2012${String(n).padStart(8, "0")}`, name: `U${n}`, passwordHash: "x", role: "CUSTOMER", status: "ACTIVE" } });
  return { id: u.id, role: "CUSTOMER" as const, isSuperAdmin: false, permissions: [] };
}

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "NotificationMute","Notification","User" RESTART IDENTITY CASCADE');
});

const send = (userId: string, type: string, key: string) => db.$transaction((tx) => notifyInTx(tx, { userId, type, title: "t", body: "b", dedupeKey: key }));

describe("notification mutes", () => {
  it("a muted non-critical kind is not delivered, other kinds and other users still are", async () => {
    const a = await user();
    const b = await user();
    expect(await setGroupMuted(a, "chat", true)).toEqual({ ok: true });
    expect(await listMyMutedGroups(a)).toEqual(["chat"]);
    await send(a.id, "CHAT_MESSAGE", "k1");
    await send(b.id, "CHAT_MESSAGE", "k2");
    await send(a.id, "ORDER_APPROVED", "k3");
    expect(await db.notification.count({ where: { userId: a.id, type: "CHAT_MESSAGE" } })).toBe(0);
    expect(await db.notification.count({ where: { userId: b.id, type: "CHAT_MESSAGE" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: a.id, type: "ORDER_APPROVED" } })).toBe(1);
    await setGroupMuted(a, "chat", false);
    await send(a.id, "CHAT_MESSAGE", "k4");
    expect(await db.notification.count({ where: { userId: a.id, type: "CHAT_MESSAGE" } })).toBe(1);
  });

  it("critical kinds can never be muted", async () => {
    const a = await user();
    for (const key of ["orders", "ORDER_APPROVED", "payments", "", "REFUND_COMPLETED"]) expect(await setGroupMuted(a, key, true)).toEqual({ ok: false });
    expect(await db.notificationMute.count()).toBe(0);
    await send(a.id, "PAYMENT_CONFIRMED", "p1");
    expect(await db.notification.count({ where: { userId: a.id } })).toBe(1);
  });
});
