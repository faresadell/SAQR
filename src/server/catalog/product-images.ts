import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { readStoredImage, storeCheckedImage } from "@/server/uploads/store-image";

export type ProductImageResult = { ok: true } | { ok: false; error: "INVALID_FILE" | "FILE_TOO_LARGE" };

/** The shop owner sets the picture of one of THEIR products; an administrator with the catalog permission can set any product's. The file type is decided from its bytes, never from the name sent. */
export async function uploadProductImage(actor: Actor, productId: string, bytes: Uint8Array): Promise<ProductImageResult> {
  const isAdmin = actor.role === "ADMIN" && hasPermission(actor, "catalog.manage");
  if (actor.role !== "MERCHANT" && !isAdmin) throw new AuthorizationError();
  const product = await db.product.findFirst({ where: { id: productId, ...(isAdmin ? {} : { merchant: { ownerId: actor.id } }), archivedAt: null } }); // owner-scoped unless an administrator
  if (!product) throw new NotFoundError();
  const stored = await storeCheckedImage("product-images", product.id, bytes);
  if (!stored.ok) return stored;
  const key = stored.key;
  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: product.id }, data: { imageKey: key } });
    await writeAudit({ actorId: actor.id, action: "PRODUCT_IMAGE_SET", entityType: "Product", entityId: product.id, before: { imageKey: product.imageKey }, after: { imageKey: key, sizeBytes: stored.sizeBytes } }, tx);
  });
  return { ok: true };
}

/** Public read: only for products a shopper can see (available, not archived, approved shop). */
export async function readProductImage(productId: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const product = await db.product.findFirst({ where: { id: productId, isAvailable: true, archivedAt: null, merchant: { status: "APPROVED" } }, select: { imageKey: true } });
  return readStoredImage(product?.imageKey);
}
