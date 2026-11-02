import "server-only";
import type { Prisma } from "@prisma/client";

export interface TransferExclusion {
  paymentId?: string;
  planPurchaseId?: string;
  membershipPurchaseId?: string;
}

/**
 * Has this transfer (method + reference) already been CONFIRMED anywhere: an order payment, an approved plan purchase,
 * or an approved membership purchase? One real transfer can fund exactly one thing.
 */
export async function transferConfirmedElsewhere(tx: Prisma.TransactionClient, method: string, referenceNo: string, except: TransferExclusion = {}): Promise<boolean> {
  const [payment, plan, membership] = await Promise.all([
    tx.payment.findFirst({ where: { method, referenceNo, confirmedAt: { not: null }, ...(except.paymentId ? { id: { not: except.paymentId } } : {}) }, select: { id: true } }),
    tx.planPurchase.findFirst({ where: { method, referenceNo, status: "APPROVED", ...(except.planPurchaseId ? { id: { not: except.planPurchaseId } } : {}) }, select: { id: true } }),
    tx.membershipPurchase.findFirst({ where: { method, referenceNo, status: "APPROVED", ...(except.membershipPurchaseId ? { id: { not: except.membershipPurchaseId } } : {}) }, select: { id: true } }),
  ]);
  return payment !== null || plan !== null || membership !== null;
}
