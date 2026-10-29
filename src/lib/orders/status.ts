// Suborder (table "Order") state machine and the parent-order status derived from its suborders.
// Pure and framework-free. The service layer must call canTransition() inside the same transaction that writes the change.
export type OrderStatusName =
  | "AWAITING_PAYMENT"
  | "AWAITING_MERCHANT_APPROVAL"
  | "APPROVED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLATION_REQUESTED"
  | "CANCELLED"
  | "REJECTED";

export const TERMINAL_STATUSES: readonly OrderStatusName[] = ["DELIVERED", "CANCELLED", "REJECTED"];

// Proposed flow (needs owner confirmation, docs/PHASE4.md): the customer submits a receipt, the merchant confirms the
// transfer, then approves the order; stars are charged on approval.
const TRANSITIONS: Record<OrderStatusName, readonly OrderStatusName[]> = {
  AWAITING_PAYMENT: ["AWAITING_MERCHANT_APPROVAL", "CANCELLED"],
  AWAITING_MERCHANT_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PREPARING", "CANCELLATION_REQUESTED", "CANCELLED"],
  PREPARING: ["READY", "CANCELLATION_REQUESTED"],
  READY: ["OUT_FOR_DELIVERY", "CANCELLATION_REQUESTED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLATION_REQUESTED"],
  CANCELLATION_REQUESTED: ["CANCELLED", "APPROVED", "PREPARING", "READY", "OUT_FOR_DELIVERY"],
  DELIVERED: [],
  CANCELLED: [],
  REJECTED: [],
};

export function canTransition(from: OrderStatusName, to: OrderStatusName): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: OrderStatusName): readonly OrderStatusName[] {
  return TRANSITIONS[from];
}

export function isTerminal(status: OrderStatusName): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export type ParentOrderStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "PARTIALLY_COMPLETED" | "CANCELLED";

/** The parent status is never edited by hand: it is always derived from its suborders. */
export function deriveParentStatus(children: readonly OrderStatusName[]): ParentOrderStatus {
  if (children.length === 0) throw new Error("A parent order needs at least one suborder");
  if (children.every(isTerminal)) {
    const delivered = children.filter((s) => s === "DELIVERED").length;
    if (delivered === children.length) return "COMPLETED";
    if (delivered === 0) return "CANCELLED";
    return "PARTIALLY_COMPLETED";
  }
  const stillPending = children.every((s) => s === "AWAITING_PAYMENT" || s === "AWAITING_MERCHANT_APPROVAL" || isTerminal(s));
  const anyLive = children.some((s) => !isTerminal(s) && s !== "AWAITING_PAYMENT" && s !== "AWAITING_MERCHANT_APPROVAL");
  return stillPending && !anyLive ? "PENDING" : "IN_PROGRESS";
}

export interface StarsEffect {
  kind: "NONE" | "CHARGE" | "REFUND";
}

/**
 * What a transition does to stars, per suborder. Charge happens once on approval; refund happens once when an approved
 * (already charged) suborder is cancelled. Both are guarded again by the unique ledger key, so a retry cannot repeat them.
 */
export function starsEffectOf(from: OrderStatusName, to: OrderStatusName, alreadyCharged: boolean, alreadyRefunded: boolean): StarsEffect {
  if (to === "APPROVED" && from === "AWAITING_MERCHANT_APPROVAL" && !alreadyCharged) return { kind: "CHARGE" };
  if (to === "CANCELLED" && alreadyCharged && !alreadyRefunded) return { kind: "REFUND" };
  return { kind: "NONE" };
}
