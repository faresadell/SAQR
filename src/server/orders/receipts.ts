import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { canViewReceipt } from "@/lib/auth/receipt-access";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { detectImage, MAX_RECEIPT_BYTES } from "@/lib/uploads/image-sniff";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { getStorage } from "@/server/uploads/storage";

const MAX_UNUSED_PER_ORDER = 5;

export type UploadResult = { ok: true; uploadId: string } | { ok: false; error: "INVALID_FILE" | "FILE_TOO_LARGE" | "WRONG_STATE" | "TOO_MANY_UPLOADS" };

/** Stores a receipt image for the customer's own suborder that is still waiting for payment. Returns an upload id for `payment`. */
export async function uploadReceipt(actor: Actor, orderId: string, bytes: Uint8Array): Promise<UploadResult> {
  if (actor.role !== "CUSTOMER") throw new AuthorizationError();
  const order = await db.order.findFirst({ where: { id: orderId, customerId: actor.id } }); // owner-scoped
  if (!order) throw new NotFoundError();
  if (order.orderStatus !== "AWAITING_PAYMENT" || (order.paymentStatus !== "NOT_REQUIRED_YET" && order.paymentStatus !== "REJECTED")) return { ok: false, error: "WRONG_STATE" };
  if (bytes.length > MAX_RECEIPT_BYTES) return { ok: false, error: "FILE_TOO_LARGE" };
  const kind = detectImage(bytes);
  if (!kind) return { ok: false, error: "INVALID_FILE" };
  return storeReceipt(actor, orderId, bytes, kind);
}

/** Proof image for a plan purchase (not tied to an order). Only the buyer can later use it. */
export async function uploadPlanReceipt(actor: Actor, bytes: Uint8Array): Promise<UploadResult> {
  if (actor.role === "ADMIN") throw new AuthorizationError();
  if (bytes.length > MAX_RECEIPT_BYTES) return { ok: false, error: "FILE_TOO_LARGE" };
  const kind = detectImage(bytes);
  if (!kind) return { ok: false, error: "INVALID_FILE" };
  return storeReceipt(actor, null, bytes, kind);
}

async function storeReceipt(actor: Actor, orderId: string | null, bytes: Uint8Array, kind: NonNullable<ReturnType<typeof detectImage>>): Promise<UploadResult> {
  if ((await db.receiptUpload.count({ where: { orderId, uploaderId: actor.id, usedAt: null } })) >= MAX_UNUSED_PER_ORDER) return { ok: false, error: "TOO_MANY_UPLOADS" };

  const storageKey = `receipts/${orderId ?? `plan${actor.id}`}/${randomUUID()}.${kind.ext}`;
  await getStorage().put(storageKey, bytes);
  const row = await db.receiptUpload.create({
    data: { orderId, uploaderId: actor.id, storageKey, contentType: kind.contentType, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") },
  });
  await writeAudit({ actorId: actor.id, action: "RECEIPT_UPLOADED", entityType: orderId ? "Order" : "PlanPurchase", entityId: orderId ?? actor.id, after: { uploadId: row.id, sizeBytes: bytes.length } });
  return { ok: true, uploadId: row.id };
}

/** Only the order's customer, its shop owner, or an admin with payments.review. Everyone else gets "not found". */
export async function readReceipt(actor: Actor, uploadId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const upload = await db.receiptUpload.findUnique({ where: { id: uploadId } });
  if (!upload) throw new NotFoundError();
  if (upload.orderId === null) {
    // Plan-purchase proof: the buyer, or an admin who reviews payments.
    if (upload.uploaderId !== actor.id && !hasPermission(actor, "payments.review")) throw new NotFoundError();
    const planBytes = await getStorage().get(upload.storageKey);
    if (!planBytes) throw new NotFoundError();
    await writeAudit({ actorId: actor.id, action: "RECEIPT_VIEWED", entityType: "PlanPurchase", entityId: upload.id, after: { uploadId } });
    return { bytes: planBytes, contentType: upload.contentType };
  }
  const order = await db.order.findUnique({ where: { id: upload.orderId }, include: { merchant: { select: { ownerId: true } } } });
  if (!order || !canViewReceipt(actor, { customerId: order.customerId, merchantOwnerId: order.merchant.ownerId })) throw new NotFoundError();
  const bytes = await getStorage().get(upload.storageKey);
  if (!bytes) throw new NotFoundError();
  await writeAudit({ actorId: actor.id, action: "RECEIPT_VIEWED", entityType: "Order", entityId: order.id, after: { uploadId } });
  return { bytes, contentType: upload.contentType };
}
