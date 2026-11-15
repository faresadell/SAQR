import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { detectImage, MAX_RECEIPT_BYTES } from "@/lib/uploads/image-sniff";
import { getStorage } from "@/server/uploads/storage";
import type { Actor } from "@/lib/auth/permissions";
import { consumeRateLimit } from "@/lib/rate-limit";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";

export type ChatError = "INVALID_MESSAGE" | "RATE_LIMITED" | "SHOP_UNAVAILABLE" | "INVALID_FILE" | "FILE_TOO_LARGE";
export type ChatResult<T = object> = ({ ok: true } & T) | { ok: false; error: ChatError };

export const MAX_MESSAGE_LENGTH = 1000;
const NOTIFY_BUCKET_MS = 10 * 60_000; // one "new message" notification per conversation per 10 minutes

type Side = "customer" | "merchant";

/** The conversation only if the actor is the customer or the shop owner in it. Anyone else (admins included) gets NotFound. */
async function loadForParticipant(actor: Actor, conversationId: string) {
  const row = await db.conversation.findUnique({ where: { id: String(conversationId) } });
  if (!row) throw new NotFoundError();
  if (actor.role === "CUSTOMER" && row.customerId === actor.id) return { row, side: "customer" as Side };
  if (actor.role === "MERCHANT") {
    const shop = await db.merchant.findUnique({ where: { ownerId: actor.id }, select: { id: true } });
    if (shop && shop.id === row.merchantId) return { row, side: "merchant" as Side };
  }
  throw new NotFoundError();
}

/** A message needs text, a picture, or both. Text is at most MAX_MESSAGE_LENGTH. */
function cleanBody(raw: unknown, hasImage = false): string | null {
  const body = typeof raw === "string" ? raw.trim() : "";
  return body.length <= MAX_MESSAGE_LENGTH && (body.length >= 1 || hasImage) ? body : null;
}

type StoredImage = { key: string; type: string };

/** Checks the bytes really are a picture (not the file name or type the browser claims) and stores them privately. */
async function storeImage(conversationId: string, bytes: Uint8Array): Promise<{ ok: true; image: StoredImage } | { ok: false; error: "INVALID_FILE" | "FILE_TOO_LARGE" }> {
  if (bytes.length > MAX_RECEIPT_BYTES) return { ok: false, error: "FILE_TOO_LARGE" };
  const kind = detectImage(bytes);
  if (!kind) return { ok: false, error: "INVALID_FILE" };
  const key = `chat-images/${conversationId}/${randomUUID()}.${kind.ext}`;
  await getStorage().put(key, bytes);
  return { ok: true, image: { key, type: kind.contentType } };
}

async function append(conversationId: string, senderId: string, side: Side, body: string, notify: { userId: string; title: string }, image?: StoredImage) {
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.message.create({ data: { conversationId, senderId, body, ...(image ? { imageKey: image.key, imageType: image.type } : {}) } });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now, ...(side === "customer" ? { customerReadAt: now } : { merchantReadAt: now }) } });
    const bucket = Math.floor(now.getTime() / NOTIFY_BUCKET_MS);
    await notifyInTx(tx, { userId: notify.userId, type: "CHAT_MESSAGE", title: notify.title, body: !body ? "أرسل صورة" : body.length > 80 ? `${body.slice(0, 80)}…` : body, data: { conversationId }, dedupeKey: `chat:${conversationId}:${side}:${bucket}` });
  });
}

/** Customer opens (or reuses) the single conversation with an approved shop and sends the first message. */
export async function startConversation(actor: Actor, input: { merchantId: string; body: string }): Promise<ChatResult<{ conversationId: string }>> {
  if (actor.role !== "CUSTOMER") throw new AuthorizationError();
  const body = cleanBody(input.body);
  if (!body) return { ok: false, error: "INVALID_MESSAGE" };
  const shop = await db.merchant.findUnique({ where: { id: String(input.merchantId) }, select: { id: true, ownerId: true, status: true, name: true } });
  if (!shop || shop.status !== "APPROVED") return { ok: false, error: "SHOP_UNAVAILABLE" };
  if (!(await consumeRateLimit(`chat:${actor.id}`, 30, 600))) return { ok: false, error: "RATE_LIMITED" };
  const convo = await db.conversation.upsert({ where: { customerId_merchantId: { customerId: actor.id, merchantId: shop.id } }, create: { customerId: actor.id, merchantId: shop.id }, update: {} });
  await append(convo.id, actor.id, "customer", body, { userId: shop.ownerId, title: "رسالة جديدة من عميل" });
  return { ok: true, conversationId: convo.id };
}

export async function sendMessage(actor: Actor, conversationId: string, rawBody: string, imageBytes?: Uint8Array | null): Promise<ChatResult> {
  const { row, side } = await loadForParticipant(actor, conversationId);
  const body = cleanBody(rawBody, Boolean(imageBytes));
  if (body === null) return { ok: false, error: "INVALID_MESSAGE" };
  if (!(await consumeRateLimit(`chat:${actor.id}`, 30, 600))) return { ok: false, error: "RATE_LIMITED" };
  let image: StoredImage | undefined;
  if (imageBytes) {
    const stored = await storeImage(row.id, imageBytes);
    if (!stored.ok) return stored;
    image = stored.image;
  }
  if (side === "customer") {
    const shop = await db.merchant.findUnique({ where: { id: row.merchantId }, select: { ownerId: true, status: true } });
    if (!shop || shop.status !== "APPROVED") return { ok: false, error: "SHOP_UNAVAILABLE" };
    await append(row.id, actor.id, side, body, { userId: shop.ownerId, title: "رسالة جديدة من عميل" }, image);
  } else {
    const shop = await db.merchant.findUnique({ where: { id: row.merchantId }, select: { name: true } });
    await append(row.id, actor.id, side, body, { userId: row.customerId, title: `رسالة جديدة من ${shop?.name ?? "النشاط"}` }, image);
  }
  return { ok: true };
}

/** Messages of one conversation (oldest first, last 200). Opening it marks it read for the caller's side. */
export async function openConversation(actor: Actor, conversationId: string) {
  const { row, side } = await loadForParticipant(actor, conversationId);
  const [messages, customer, shop] = await Promise.all([
    db.message.findMany({ where: { conversationId: row.id }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, senderId: true, body: true, imageKey: true, createdAt: true } }),
    db.user.findUnique({ where: { id: row.customerId }, select: { name: true } }),
    db.merchant.findUnique({ where: { id: row.merchantId }, select: { id: true, name: true } }),
  ]);
  await db.conversation.update({ where: { id: row.id }, data: side === "customer" ? { customerReadAt: new Date() } : { merchantReadAt: new Date() } });
  return { id: row.id, side, title: side === "customer" ? (shop?.name ?? "النشاط") : (customer?.name ?? "عميل"), shopId: shop?.id ?? null, messages: messages.reverse().map((m) => ({ id: m.id, mine: m.senderId === actor.id, body: m.body, hasImage: m.imageKey !== null, createdAt: m.createdAt.toISOString() })) };
}

/** Own conversations, newest activity first, with the last message and an unread flag. */
export async function listConversations(actor: Actor) {
  let where;
  if (actor.role === "CUSTOMER") where = { customerId: actor.id };
  else if (actor.role === "MERCHANT") {
    const shop = await db.merchant.findUnique({ where: { ownerId: actor.id }, select: { id: true } });
    if (!shop) return [];
    where = { merchantId: shop.id };
  } else throw new AuthorizationError();
  const rows = await db.conversation.findMany({ where, orderBy: { lastMessageAt: "desc" }, take: 100, include: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, imageKey: true, senderId: true } } } });
  const [shops, customers] = await Promise.all([
    db.merchant.findMany({ where: { id: { in: rows.map((r) => r.merchantId) } }, select: { id: true, name: true } }),
    db.user.findMany({ where: { id: { in: rows.map((r) => r.customerId) } }, select: { id: true, name: true } }),
  ]);
  const shopName = new Map(shops.map((s) => [s.id, s.name]));
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  return rows.map((r) => {
    const readAt = actor.role === "CUSTOMER" ? r.customerReadAt : r.merchantReadAt;
    const last = r.messages[0];
    return { id: r.id, title: actor.role === "CUSTOMER" ? (shopName.get(r.merchantId) ?? "النشاط") : (customerName.get(r.customerId) ?? "عميل"), lastBody: last?.body || (last?.imageKey ? "📷 صورة" : ""), lastMessageAt: r.lastMessageAt.toISOString(), unread: Boolean(last) && last!.senderId !== actor.id && (!readAt || readAt < r.lastMessageAt) };
  });
}

/** The picture of one message, only for the two people in that conversation. Anyone else gets NotFound. */
export async function readChatImage(actor: Actor, messageId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const msg = await db.message.findUnique({ where: { id: String(messageId) }, select: { conversationId: true, imageKey: true, imageType: true } });
  if (!msg || !msg.imageKey || !msg.imageType) throw new NotFoundError();
  await loadForParticipant(actor, msg.conversationId);
  const bytes = await getStorage().get(msg.imageKey);
  if (!bytes) throw new NotFoundError();
  return { bytes, contentType: msg.imageType };
}
