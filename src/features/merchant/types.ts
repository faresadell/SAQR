import type { DeliveryStatus, OrderStatus, PaymentStatus } from "@/features/shared/status";
import type { OrderLine } from "@/features/shared/types";

/** Frontend-authored view models for merchant screens whose server side does not exist yet. */
export interface MerchantOrderRow {
  id: string;
  number: number;
  createdAt: string;
  items: OrderLine[];
  subtotalCents: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  /** Cash-transfer proof for the latest payment, shown to the shop so it can confirm the transfer. */
  payment?: { methodLabel: string; referenceNo?: string; receiptUploadId?: string; amountCents: number; rejectedReason?: string };
  customerName?: string;
  /** Which of the shop's own actions make sense now. The service re-checks every rule on submit. */
  actions: MerchantOrderActions;
}

export interface MerchantOrderActions {
  confirmPayment: boolean;
  rejectPayment: boolean;
  approve: boolean;
  reject: boolean;
  advanceTo: "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED" | null;
  assignDriver: boolean;
  cancel: boolean;
  resolveCancellation: boolean;
}

export interface MerchantDriverOption {
  id: string;
  name: string;
}

export interface MerchantOfferRow {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  state: "ACTIVE" | "EXPIRED" | "STOPPED";
  discountLabel: string | null;
}

export interface MerchantOffersData {
  /** Admin-controlled limits. Discounts are off until an administrator turns them on. */
  discounts: { enabled: boolean; maxPercent: number; maxFixedEgp: number; maxActive: number };
  baseHours: number;
  extensionStarsPerHour: number;
  offers: MerchantOfferRow[];
  products: { id: string; name: string; priceCents: number }[];
}

export interface MerchantReport {
  periodLabel: string;
  salesCents: number;
  commissionCents: number;
  settlementCents: number;
  monthly: { label: string; value: number }[];
  rows: { orderNumber: number; date: string; subtotalCents: number; commissionBp: number; commissionCents: number }[];
}
