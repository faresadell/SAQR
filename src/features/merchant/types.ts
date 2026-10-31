import type { DeliveryStatus, OrderStatus, PaymentStatus } from "@/features/shared/status";
import type { OfferQuota, OfferView, OrderLine } from "@/features/shared/types";

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
  /** Server-side permission decides which of these the merchant may use right now. */
  allowed: { accept: boolean; reject: boolean; advance: boolean; confirmPayment: boolean };
}

export interface MerchantOffersData {
  quota: OfferQuota;
  offers: OfferView[];
  /** Products the merchant can attach an offer to. */
  products: { id: string; name: string }[];
}

export interface MerchantReport {
  periodLabel: string;
  salesCents: number;
  commissionCents: number;
  settlementCents: number;
  monthly: { label: string; value: number }[];
  rows: { orderNumber: number; date: string; subtotalCents: number; commissionBp: number; commissionCents: number }[];
}
