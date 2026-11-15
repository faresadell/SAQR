/**
 * Chat integration tests (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { NotFoundError } from "@/server/errors";
import { listConversations, openConversation, readChatImage, sendMessage, startConversation } from "@/server/chat/service";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

let n = 0;
async function user(role: "CUSTOMER" | "MERCHANT" | "ADMIN"): Promise<Actor> {
  n += 1;
  const u = await db.user.create({ data: { phone: `+2013${String(n).padStart(8, "0")}`, name: `C${n}`, passwordHash: "x", role, status: "ACTIVE" } });
  return { id: u.id, role, isSuperAdmin: role === "ADMIN", permissions: [] };
}
async function shopOf(owner: Actor, status: "APPROVED" | "SUSPENDED" = "APPROVED") {
  return db.merchant.create({ data: { ownerId: owner.id, name: "متجر", businessType: "restaurant", status } });
}

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "Message","Conversation","Merchant","AuditLog","Notification","User" RESTART IDENTITY CASCADE');
});

describe("chat", () => {
  it("customer starts, shop replies, both see it; one conversation per pair; unread tracking", async () => {
    const c = await user("CUSTOMER");
    const mo = await user("MERCHANT");
    const shop = await shopOf(mo);
    const a = await startConversation(c, { merchantId: shop.id, body: "  عايز أطلب  " });
    if (!a.ok) throw new Error("setup");
    const b = await startConversation(c, { merchantId: shop.id, body: "تاني" });
    expect(b.ok && b.conversationId).toBe(a.conversationId);
    expect(await db.conversation.count()).toBe(1);

    expect((await listConversations(mo))[0]?.unread).toBe(true);
    const view = await openConversation(mo, a.conversationId);
    expect(view.messages.map((m) => m.body)).toEqual(["عايز أطلب", "تاني"]);
    expect(view.messages.every((m) => !m.mine)).toBe(true);
    expect((await listConversations(mo))[0]?.unread).toBe(false);

    expect((await sendMessage(mo, a.conversationId, "أهلاً")).ok).toBe(true);
    expect((await listConversations(c))[0]?.unread).toBe(true);
    expect((await openConversation(c, a.conversationId)).messages.at(-1)?.mine).toBe(false);
  });

  it("strangers and admins cannot read or write", async () => {
    const c = await user("CUSTOMER");
    const other = await user("CUSTOMER");
    const mo = await user("MERCHANT");
    const otherOwner = await user("MERCHANT");
    const admin = await user("ADMIN");
    const shop = await shopOf(mo);
    await shopOf(otherOwner);
    const r = await startConversation(c, { merchantId: shop.id, body: "مرحبا" });
    if (!r.ok) throw new Error("setup");
    for (const who of [other, otherOwner, admin]) {
      await expect(openConversation(who, r.conversationId)).rejects.toBeInstanceOf(NotFoundError);
      await expect(sendMessage(who, r.conversationId, "x")).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  it("rejects empty/too long messages and unapproved shops", async () => {
    const c = await user("CUSTOMER");
    const mo = await user("MERCHANT");
    const shop = await shopOf(mo);
    expect(await startConversation(c, { merchantId: shop.id, body: "   " })).toEqual({ ok: false, error: "INVALID_MESSAGE" });
    expect(await startConversation(c, { merchantId: shop.id, body: "x".repeat(1001) })).toEqual({ ok: false, error: "INVALID_MESSAGE" });
    const mo2 = await user("MERCHANT");
    const pending = await shopOf(mo2, "SUSPENDED");
    expect(await startConversation(c, { merchantId: pending.id, body: "hi" })).toEqual({ ok: false, error: "SHOP_UNAVAILABLE" });
  });

  it("sends at most one notification per 10-minute bucket", async () => {
    const c = await user("CUSTOMER");
    const mo = await user("MERCHANT");
    const shop = await shopOf(mo);
    const r = await startConversation(c, { merchantId: shop.id, body: "1" });
    if (!r.ok) throw new Error("setup");
    await sendMessage(c, r.conversationId, "2");
    await sendMessage(c, r.conversationId, "3");
    expect(await db.notification.count({ where: { userId: mo.id, type: "CHAT_MESSAGE" } })).toBeLessThanOrEqual(2); // 2 only if the bucket boundary is crossed mid-test
  });

  it("a picture can be sent alone, is checked by its real bytes, and only the two people in the chat can read it", async () => {
    const c = await user("CUSTOMER");
    const mo = await user("MERCHANT");
    const shop = await shopOf(mo);
    const r = await startConversation(c, { merchantId: shop.id, body: "مرحبا" });
    if (!r.ok) throw new Error("setup");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1]);

    expect(await sendMessage(c, r.conversationId, "", new Uint8Array(40))).toEqual({ ok: false, error: "INVALID_FILE" }); // not a picture
    expect(await sendMessage(c, r.conversationId, "", new Uint8Array(6 * 1024 * 1024))).toEqual({ ok: false, error: "FILE_TOO_LARGE" });
    expect(await sendMessage(c, r.conversationId, "")).toEqual({ ok: false, error: "INVALID_MESSAGE" }); // nothing at all

    expect((await sendMessage(c, r.conversationId, "", png)).ok).toBe(true); // picture only
    const view = await openConversation(mo, r.conversationId);
    const photo = view.messages.at(-1)!;
    expect(photo.hasImage).toBe(true);
    expect(photo.body).toBe("");
    expect((await listConversations(mo))[0]?.lastBody).toBe("📷 صورة");

    expect((await readChatImage(mo, photo.id)).contentType).toBe("image/png");
    expect((await readChatImage(c, photo.id)).bytes.length).toBe(png.length);
    await expect(readChatImage(await user("CUSTOMER"), photo.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(readChatImage(await user("ADMIN"), photo.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(readChatImage(c, view.messages[0]!.id)).rejects.toBeInstanceOf(NotFoundError); // a text message has no picture
  });
});
