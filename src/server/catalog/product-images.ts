import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/permissions";
import { detectImage, MAX_RECEIPT_BYTES } from "@/lib/uploads/image-sniff";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { getStorage } from "@/server/uploads/storage";

export type ProductImageResult = { ok: true } | { ok: false; error: "INVALID_FILE" | "FILE_TOO_LARGE" };

/** The shop owner sets the picture of one of THEIR products. The file type is decided from its bytes, never from the name sent. */
export async function uploadProductImage(actor: Actor, productId: string, bytes: Uint8Array): Promise<ProductImageResult> {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const product = await db.product.findFirst({ where: { id: productId, merchant: { ownerId: actor.id }, archivedAt: null } }); // owner-scoped
  if (!product) throw new NotFoundError();
  if (bytes.length > MAX_RECEIPT_BYTES) return { ok: false, error: "FILE_TOO_LARGE" };
  const kind = detectImage(bytes);
  if (!kind) return { ok: false, error: "INVALID_FILE" };
  const key = `product-images/${product.id}/${randomUUID()}.${kind.ext}`;
  await getStorage().put(key, bytes); // a new key each time: nothing is overwritten, caches never show a stale picture
  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: product.id }, data: { imageKey: key } });
    await writeAudit({ actorId: actor.id, action: "PRODUCT_IMAGE_SET", entityType: "Product", entityId: product.id, before: { imageKey: product.imageKey }, after: { imageKey: key, sizeBytes: bytes.length } }, tx);
  });
  return { ok: true };
}

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Public read: only for products a shopper can see (available, not archived, approved shop). */
export async function readProductImage(productId: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const product = await db.product.findFirst({ where: { id: productId, isAvailable: true, archivedAt: null, merchant: { status: "APPROVED" } }, select: { imageKey: true } });
  if (!product?.imageKey) return null;
  const bytes = await getStorage().get(product.imageKey);
  const ext = product.imageKey.split(".").pop() ?? "";
  const contentType = TYPES[ext];
  return bytes && contentType ? { bytes, contentType } : null;
}
