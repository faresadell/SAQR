import { hasPermission, type Principal } from "./permissions";

export interface ReceiptContext {
  customerId: string; // the customer who placed the order
  merchantOwnerId: string; // the owner of the merchant receiving the payment
}

/**
 * Who may open a payment receipt: the customer who uploaded it, the merchant who must confirm it,
 * and admins with payments.review. Drivers and everyone else never can.
 * The receipt-download endpoint (Phase 6) must call this on the server before streaming any file.
 */
export function canViewReceipt(user: Principal & { id: string }, order: ReceiptContext): boolean {
  switch (user.role) {
    case "CUSTOMER":
      return user.id === order.customerId;
    case "MERCHANT":
      return user.id === order.merchantOwnerId;
    case "ADMIN":
      return hasPermission(user, "payments.review");
    default:
      return false;
  }
}
