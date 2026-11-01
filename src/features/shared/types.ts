/**
 * View-model contracts used by the SAQR screens whose server side does not exist yet.
 *
 * IMPORTANT: these are the shapes the UI expects, written by the frontend. They are NOT existing API
 * contracts. When the backend exposes the matching data, map it to these shapes inside the loader in
 * `src/features/<area>/data.ts` (the only place that should know about server types).
 * All money is integer piasters, all timestamps are ISO strings, all star amounts are integers.
 */
import type { DeliveryStatus, OrderStatus, PackageState, PaymentStatus, RefundStatus } from "./status";

export interface PackageOption {
  id: string;
  name: string;
  priceCents: number;
  baseStars: number;
  bonusStars: number;
  /** Merchant packages only: offers a merchant may publish per package cycle. */
  offerQuota?: number;
}

export interface CurrentPackage {
  state: PackageState;
  packageName?: string;
  activatedAt?: string;
  expiresAt?: string;
  daysLeft?: number;
}

export interface PaymentInstruction {
  methodCode: string;
  methodLabel: string;
  /** Where to send money, exactly as configured by the platform. */
  accountLabel: string;
  /** Absent when the platform has not configured a receiving account for this method (never filled with a placeholder). */
  accountValue?: string;
}

export interface StarLedgerRow {
  id: string;
  createdAt: string;
  reason: string;
  /** Signed: negative = deducted. */
  amount: number;
  balanceAfter?: number;
  reference?: string;
}

export interface StarsOverview {
  balance: number;
  ledger: StarLedgerRow[];
}

export interface RewardTier {
  /** Completed orders needed this month. */
  threshold: number;
  rewardStars: number;
  granted: boolean;
}

export interface RewardsOverview {
  monthLabel: string;
  completedOrders: number;
  tiers: RewardTier[];
  totalRewardStars: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface AddressItem {
  id: string;
  label: string;
  line: string;
  zoneName?: string;
}

export interface OrderLine {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

/** One merchant's part of a checkout (a sub-order): own items, own payment, own preparation status. */
export interface SubOrderView {
  id: string;
  number: number;
  merchantName: string;
  items: OrderLine[];
  subtotalCents: number;
  /** What this sub-order costs the customer including its delivery fee (the amount to transfer to the shop). */
  totalCents?: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  refundStatus: RefundStatus;
  /** Present when the customer has submitted a transfer receipt for this sub-order. */
  payment?: { methodLabel: string; referenceNo?: string; submittedAt: string; amountCents: number };
  events: { key: string; label: string; at?: string; state: "done" | "current" | "upcoming" | "failed" }[];
}

export interface MainOrderView {
  id: string;
  number: number;
  createdAt: string;
  deliveryFeeCents: number;
  totalCents: number;
  addressLine: string;
  subOrders: SubOrderView[];
}

export interface OfferView {
  id: string;
  title: string;
  productName: string;
  startsAt: string;
  endsAt: string;
  starsCost: number;
  state: "ACTIVE" | "EXPIRED" | "SCHEDULED";
}

export interface OfferQuota {
  used: number;
  total: number;
  resetsAt?: string;
}

export interface ReceiptReviewRow {
  id: string;
  payerName: string;
  purpose: string;
  amountCents: number;
  methodLabel: string;
  referenceNo?: string;
  submittedAt: string;
  state: "PENDING" | "APPROVED" | "REJECTED";
  /** Protected download route for the receipt image (must enforce canViewReceipt on the server). */
  receiptHref?: string;
}

export interface TripStop {
  id: string;
  kind: "PICKUP" | "DROPOFF";
  title: string;
  address: string;
  /** Sub-orders served at this stop (merchant orders for pick-ups, customer orders for drop-offs). */
  orderNumbers: number[];
  status: "PENDING" | "DONE";
  mapUrl?: string;
  note?: string;
}

export interface TripView {
  id: string;
  state: "AVAILABLE" | "ACCEPTED" | "IN_PROGRESS" | "COMPLETED";
  stops: TripStop[];
  startedAt?: string;
  endedAt?: string;
}
