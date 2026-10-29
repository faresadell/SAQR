import type { Actor } from "../auth/permissions";

export interface MerchantRef {
  ownerId: string;
  status: string;
}

/**
 * Only the OWNER of an APPROVED merchant may change its products. The merchant is always looked up from the
 * signed-in user (never from a client-supplied id), and this check is repeated on every write.
 * Staff accounts are not part of Phase 3 (see docs/PHASE3.md).
 */
export function canManageOwnCatalog(actor: Actor, merchant: MerchantRef): boolean {
  return actor.role === "MERCHANT" && actor.id === merchant.ownerId && merchant.status === "APPROVED";
}

/** Profile editing is allowed while pending or approved; a rejected or suspended profile is read-only until resolved. */
export function canEditOwnProfile(actor: Actor, merchant: MerchantRef): boolean {
  return actor.role === "MERCHANT" && actor.id === merchant.ownerId && (merchant.status === "PENDING_REVIEW" || merchant.status === "APPROVED");
}
