import "server-only";
import type { Prisma } from "@prisma/client";
import { getSetting } from "@/lib/settings";

/**
 * Free trial for a new customer: the first N orders (setting `stars.free_trial_orders`, default 1) cost the customer no stars and need
 * no balance. The shop still pays its own stars. An order "uses" the trial once its stars were charged (the shop approved it), so
 * a cancelled or rejected-before-approval order does not burn it.
 */
export async function customerHasFreeTrial(tx: Prisma.TransactionClient, customerId: string, currentParentOrderId: string | null = null): Promise<boolean> {
  const allowed = await getSetting("stars.free_trial_orders");
  if (allowed <= 0) return false;
  // Suborders of the same checkout (several shops) are one trial order: do not count the sibling suborders of the order being charged.
  const used = await tx.order.count({ where: { customerId, starsChargedAt: { not: null }, ...(currentParentOrderId ? { OR: [{ parentOrderId: null }, { parentOrderId: { not: currentParentOrderId } }] } : {}) } });
  return used < allowed;
}
