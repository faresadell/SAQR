import type { DeliveryStatus, OrderStatus, PaymentStatus, RefundStatus } from "@/features/shared/status";

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
  id: string;
  audience: "CUSTOMER" | "MERCHANT" | "DRIVER";
  name: string;
  priceCents: number;
  baseStars: number;
  bonusStars: number;
  offerQuota?: number;
  isActive: boolean;
}

export interface ComplaintRow {
  id: string;
  orderNumber: number;
  kind: "REFUND" | "COMPLAINT";
  amountCents?: number;
  status: RefundStatus;
  dueAt?: string;
  createdAt: string;
  summary: string;
}

export interface AuditRow {
  id: string;
  createdAt: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
}
