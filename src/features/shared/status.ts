/**
 * Labels and tones for every status the UI shows. The unions mirror the enums in prisma/schema.prisma
 * (kept local so client components never import Prisma). If the schema adds a value, add it here too.
 */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";
export interface StatusInfo {
  label: string;
  tone: Tone;
}

export type OrderStatus =
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

export type PaymentStatus = "NOT_REQUIRED_YET" | "RECEIPT_SUBMITTED" | "AWAITING_MERCHANT_CONFIRMATION" | "CONFIRMED" | "DISPUTED" | "REJECTED";
export type DeliveryStatus = "NOT_STARTED" | "AWAITING_DRIVER" | "DRIVER_ASSIGNED" | "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED";
export type RefundStatus = "NONE" | "PENDING" | "UNDER_REVIEW" | "COMPLETED";
export type MerchantStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";

export const ORDER_STATUS: Record<OrderStatus, StatusInfo> = {
  AWAITING_PAYMENT: { label: "بانتظار الدفع", tone: "warning" },
  AWAITING_MERCHANT_APPROVAL: { label: "بانتظار موافقة النشاط", tone: "warning" },
  APPROVED: { label: "تمت الموافقة", tone: "info" },
  PREPARING: { label: "قيد التجهيز", tone: "info" },
  READY: { label: "جاهز", tone: "info" },
  OUT_FOR_DELIVERY: { label: "في الطريق", tone: "info" },
  DELIVERED: { label: "تم التسليم", tone: "success" },
  CANCELLATION_REQUESTED: { label: "طلب إلغاء", tone: "warning" },
  CANCELLED: { label: "ملغي", tone: "neutral" },
  REJECTED: { label: "مرفوض", tone: "danger" },
};

export const PAYMENT_STATUS: Record<PaymentStatus, StatusInfo> = {
  NOT_REQUIRED_YET: { label: "لم يُطلب الدفع بعد", tone: "neutral" },
  RECEIPT_SUBMITTED: { label: "قيد المراجعة", tone: "warning" },
  AWAITING_MERCHANT_CONFIRMATION: { label: "بانتظار تأكيد النشاط", tone: "warning" },
  CONFIRMED: { label: "تم تأكيد الدفع", tone: "success" },
  DISPUTED: { label: "معترض عليه", tone: "danger" },
  REJECTED: { label: "مرفوض", tone: "danger" },
};

export const DELIVERY_STATUS: Record<DeliveryStatus, StatusInfo> = {
  NOT_STARTED: { label: "لم يبدأ", tone: "neutral" },
  AWAITING_DRIVER: { label: "بانتظار سائق", tone: "warning" },
  DRIVER_ASSIGNED: { label: "تم إسناده لسائق", tone: "info" },
  PICKED_UP: { label: "تم الاستلام من النشاط", tone: "info" },
  OUT_FOR_DELIVERY: { label: "في الطريق إليك", tone: "info" },
  DELIVERED: { label: "تم التسليم", tone: "success" },
  FAILED: { label: "تعذر التسليم", tone: "danger" },
};

export const REFUND_STATUS: Record<RefundStatus, StatusInfo> = {
  NONE: { label: "لا يوجد", tone: "neutral" },
  PENDING: { label: "بانتظار الاسترداد", tone: "warning" },
  UNDER_REVIEW: { label: "قيد المراجعة", tone: "warning" },
  COMPLETED: { label: "تم الاسترداد", tone: "success" },
};

export const MERCHANT_STATUS: Record<MerchantStatus, StatusInfo> = {
  PENDING_REVIEW: { label: "قيد المراجعة", tone: "warning" },
  APPROVED: { label: "معتمد", tone: "success" },
  REJECTED: { label: "مرفوض", tone: "danger" },
  SUSPENDED: { label: "موقوف", tone: "danger" },
};

/** Subscription / package states shown on package cards. */
export type PackageState = "ACTIVE" | "PENDING_REVIEW" | "EXPIRED" | "NONE" | "REJECTED";
export const PACKAGE_STATE: Record<PackageState, StatusInfo> = {
  ACTIVE: { label: "نشطة", tone: "success" },
  PENDING_REVIEW: { label: "قيد المراجعة", tone: "warning" },
  EXPIRED: { label: "منتهية", tone: "neutral" },
  NONE: { label: "لا توجد باقة", tone: "neutral" },
  REJECTED: { label: "مرفوضة", tone: "danger" },
};
