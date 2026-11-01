import type { DeliveryStatus, OrderStatus, PaymentStatus } from "@/features/shared/status";

/** Frontend-authored view models for admin screens without a server side yet. */
export interface AdminOrderRow {
  id: string;
  number: number;
  createdAt: string;
  customerName: string;
  merchantName: string;
  totalCents: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
}

export interface PackageAdminRow {
  code: string;
  audience: "CUSTOMER" | "MERCHANT" | "DRIVER";
  name: string;
  priceCents: number;
  baseStars: number;
  bonusStars: number;
  offerQuota: number | null;
  isActive: boolean;
}

export interface PurchaseReviewRow {
  id: string;
  buyerName: string;
  buyerRole: string;
  planName: string;
  priceCents: number;
  stars: number;
  method: string;
  referenceNo: string;
  flagged: boolean;
  flagReason: string | null;
  createdAt: string;
  receiptUploadId: string | null;
}

export interface RefundReviewRow {
  id: string;
  orderNumber: number;
  amountCents: number;
  status: "PENDING" | "UNDER_REVIEW" | "COMPLETED";
  dueAt: string;
  isOverdue: boolean;
  hasProof: boolean;
  proofUploadId: string | null;
  decisionNote: string | null;
}

export interface ComplaintAdminRow {
  id: string;
  orderNumber: number | null;
  subject: string;
  details: string;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
  adminResponse: string | null;
  createdAt: string;
}

export interface ComplaintsAdminData {
  complaints: ComplaintAdminRow[] | null;
  refunds: RefundReviewRow[];
}

export interface OfferAdminRow {
  id: string;
  title: string;
  merchantName: string;
  endsAt: string;
  state: "ACTIVE" | "EXPIRED" | "STOPPED";
  discountLabel: string | null;
  stopReason: string | null;
}

export interface ContestAdminData {
  monthKey: string;
  closed: boolean;
  enabled: boolean;
  rulesApproved: boolean;
  rules: { minSubtotalCents: number; maxOrdersPerShop: number };
  standings: { userId: string; name: string; rank: number; qualifyingOrders: number; qualifyingSalesCents: number }[];
  excluded: { userId: string; reason: string }[];
  awards: { id: string; rank: number; userName: string; prizeCents: number; status: string; basisNote: string; paymentReference: string | null }[];
}

export interface AuditRow {
  id: string;
  createdAt: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
}
