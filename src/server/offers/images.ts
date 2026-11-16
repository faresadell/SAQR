import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { readStoredImage, storeCheckedImage } from "@/server/uploads/store-image";

export type OfferImageResult = { ok: true } | { ok: false; error: "INVALID_FILE" | "FILE_TOO_LARGE" };

/** The shop owner sets the picture of one of THEIR offers (owner-scoped query: another shop's offer is simply not found). */
export async function uploadOfferImage(actor: Actor, offerId: string, bytes: Uint8Array): Promise<OfferImageResult> {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const offer = await db.offer.findFirst({ where: { id: offerId, merchant: { ownerId: actor.id } } });
  if (!offer) throw new NotFoundError();
  const stored = await storeCheckedImage("offer-images", offer.id, bytes);
  if (!stored.ok) return stored;
  await db.$transaction(async (tx) => {
    await tx.offer.update({ where: { id: offer.id }, data: { imageKey: stored.key } });
    await writeAudit({ actorId: actor.id, action: "OFFER_IMAGE_SET", entityType: "Offer", entityId: offer.id, before: { imageKey: offer.imageKey }, after: { imageKey: stored.key, sizeBytes: stored.sizeBytes } }, tx);
  });
  return { ok: true };
}

/** Public read: only for running offers of approved shops. */
export async function readOfferImage(offerId: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const offer = await db.offer.findFirst({ where: { id: offerId, status: "ACTIVE", endsAt: { gt: new Date() }, merchant: { status: "APPROVED" } }, select: { imageKey: true } });
  return readStoredImage(offer?.imageKey);
}
