"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { fileComplaint } from "@/server/complaints/service";
import { createReview } from "@/server/reviews/service";
import { checkCouponForCart } from "@/server/coupons/service";
import type { CouponKind } from "@/lib/coupons/discount";
import { createAddress, deleteAddress } from "@/server/addresses/service";
import { requireRole } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { placeOrder } from "@/server/orders/checkout";
import { answerDeliveryFee } from "@/server/orders/delivery";
import { cancelOrder, requestCancellation, submitPayment } from "@/server/orders/lifecycle";
import { currentUnitPrices } from "@/server/orders/prices";
import { uploadReceipt } from "@/server/orders/receipts";
import { ADDRESS_MESSAGES, DENIED_ERROR, GENERIC_ERROR, LIFECYCLE_MESSAGES, NOT_FOUND_ERROR, PLACE_ORDER_MESSAGES, UPLOAD_MESSAGES } from "@/features/shared/messages";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function fileBytes(formData: FormData, name: string): Promise<Uint8Array | null> {
  const file = formData.get(name);
  if (!(file instanceof File) || file.size === 0) return null;
  return new Uint8Array(await file.arrayBuffer());
}

function failure(error: unknown): FormState {
  if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
  if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
  console.error(error);
  return { error: GENERIC_ERROR };
}

// ───────────── addresses ─────────────

/** The optional pin from the map picker: both numbers inside Egypt, or neither. Returns null when the pair is wrong. */
function mapPoint(formData: FormData): { lat: number; lng: number } | Record<string, never> | null {
  const a = text(formData, "lat");
  const b = text(formData, "lng");
  if (!a && !b) return {};
  const lat = Number(a);
  const lng = Number(b);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 21.5 && lat <= 32 && lng >= 24.5 && lng <= 37 ? { lat, lng } : null;
}

export async function addAddressAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER");
  try {
    const spot = mapPoint(formData);
    if (!spot) return { error: ADDRESS_MESSAGES.BAD_LOCATION! };
    const result = await createAddress(user, { label: text(formData, "label") || null, line: text(formData, "line"), ...spot });
    if (!result.ok) return { error: ADDRESS_MESSAGES[result.error] ?? GENERIC_ERROR };
    revalidatePath("/account/addresses");
    revalidatePath("/checkout");
    return { message: "تم حفظ العنوان." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteAddressAction(formData: FormData): Promise<void> {
  const { user } = await requireRole("CUSTOMER");
  try {
    await deleteAddress(user, text(formData, "addressId"));
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
}

// ───────────── checkout ─────────────

const placeSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  addressId: z.string().min(1).max(64),
  couponCode: z.string().trim().max(20).optional(),
  lines: z.array(z.object({ productId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(99), expectedUnitPriceCents: z.number().int().min(0).optional() })).min(1).max(60),
});

export type PlaceOrderActionResult =
  | { ok: true; parentOrderId: string }
  | { ok: false; error: string; /** Present for PRICE_CHANGED: today's per-unit prices, so the cart can be refreshed and re-confirmed. */ prices?: Record<string, number> };

/** The client sends only what the customer chose. Prices, fees, discounts and totals are decided by the server inside the order transaction. */
export async function placeOrderAction(input: unknown): Promise<PlaceOrderActionResult> {
  const { user } = await requireRole("CUSTOMER");
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: PLACE_ORDER_MESSAGES.INVALID_REQUEST! };
  try {
    const result = await placeOrder(user, parsed.data);
    if (!result.ok) {
      const prices = result.error === "PRICE_CHANGED" ? await currentUnitPrices(parsed.data.lines.map((l) => l.productId)) : undefined;
      return { ok: false, error: PLACE_ORDER_MESSAGES[result.error] ?? GENERIC_ERROR, ...(prices ? { prices } : {}) };
    }
    revalidatePath("/account/orders");
    return { ok: true, parentOrderId: result.parentOrderId };
  } catch (error) {
    console.error(error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export type CouponCheckResult = { ok: true; code: string; kind: CouponKind; value: number; merchantId: string | null } | { ok: false; error: string };

/** Is this code usable for the shops in the cart? Only a preview; the order transaction decides the real discount. */
export async function checkCouponAction(code: string, merchantIds: string[]): Promise<CouponCheckResult> {
  const { user } = await requireRole("CUSTOMER");
  try {
    const r = await checkCouponForCart(user, String(code ?? "").slice(0, 40), merchantIds.slice(0, 60).map(String));
    if (!r.ok) return { ok: false, error: PLACE_ORDER_MESSAGES[r.error] ?? (r.error === "RATE_LIMITED" ? "حاولت كثيراً. انتظر قليلاً." : GENERIC_ERROR) };
    return { ok: true, code: r.coupon.code, kind: r.coupon.kind, value: r.coupon.value, merchantId: r.coupon.merchantId };
  } catch (error) {
    console.error(error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ───────────── paying a sub-order and cancelling ─────────────

/** Receipt image + transfer reference for ONE sub-order. The merchant confirms; nothing here marks it paid. */
export async function payOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER");
  const orderId = text(formData, "orderId");
  const bytes = await fileBytes(formData, "receipt");
  if (!bytes) return { fieldErrors: { receipt: "اختر صورة الإيصال." } };
  try {
    const upload = await uploadReceipt(user, orderId, bytes);
    if (!upload.ok) return { error: UPLOAD_MESSAGES[upload.error] ?? GENERIC_ERROR };
    const result = await submitPayment(user, orderId, { accountId: text(formData, "accountId"), referenceNo: text(formData, "referenceNo"), uploadId: upload.uploadId });
    if (!result.ok) return { error: LIFECYCLE_MESSAGES[result.error] ?? GENERIC_ERROR };
    revalidatePath("/account/orders", "layout");
    return { message: "تم إرسال الإيصال. بانتظار تأكيد النشاط للدفع." };
  } catch (error) {
    return failure(error);
  }
}

export async function answerFeeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER");
  try {
    const result = await answerDeliveryFee(user, text(formData, "orderId"), text(formData, "answer") === "approve");
    if (!result.ok) return { error: LIFECYCLE_MESSAGES[result.error] ?? GENERIC_ERROR };
    revalidatePath("/account/orders", "layout");
    return { message: "تم تسجيل ردك." };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER");
  const reason = text(formData, "reason");
  if (reason.length < 3) return { fieldErrors: { reason: "اكتب سبب الإلغاء (٣ أحرف على الأقل)." } };
  try {
    const orderId = text(formData, "orderId");
    const mode = text(formData, "mode");
    const result = mode === "request" ? await requestCancellation(user, orderId, reason) : await cancelOrder(user, orderId, reason);
    if (!result.ok) return { error: LIFECYCLE_MESSAGES[result.error] ?? GENERIC_ERROR };
    revalidatePath("/account/orders", "layout");
    return { message: mode === "request" ? "تم إرسال طلب الإلغاء للنشاط." : "تم إلغاء الطلب." };
  } catch (error) {
    return failure(error);
  }
}

// ───────────── complaints ─────────────

const COMPLAINT_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "اكتب عنواناً (3 أحرف على الأقل) وتفاصيل (10 أحرف على الأقل).",
  RATE_LIMITED: "قدّمت شكاوى كثيرة اليوم. حاول لاحقاً.",
  WRONG_STATE: "لا يمكن تقديم شكوى الآن.",
};

/** A complaint about one of the customer's own sub-orders. Refunds stay in the refund flow. */
export async function fileComplaintAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER");
  try {
    const result = await fileComplaint(user, { orderId: text(formData, "orderId"), subject: text(formData, "subject"), details: text(formData, "details") });
    if (!result.ok) return { error: COMPLAINT_MESSAGES[result.error] ?? GENERIC_ERROR };
    revalidatePath("/account/orders", "layout");
    return { message: "وصلت شكواك للنشاط وللإدارة وسنرد عليك هنا." };
  } catch (error) {
    return failure(error);
  }
}

// ───────────── reviews ─────────────

const REVIEW_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "اختر عدد النجوم من 1 إلى 5. التعليق حتى 500 حرف.",
  RATE_LIMITED: "قيّمت طلبات كثيرة اليوم. حاول لاحقاً.",
  NOT_DELIVERED: "تقدر تقيّم الطلب بعد وصوله.",
  ALREADY_REVIEWED: "قيّمت هذا الطلب قبل كده.",
};

export async function createReviewAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER");
  try {
    const result = await createReview(user, { orderId: text(formData, "orderId"), rating: Number(text(formData, "rating")), comment: text(formData, "comment") });
    if (!result.ok) return { error: REVIEW_MESSAGES[result.error] ?? GENERIC_ERROR };
    revalidatePath("/account/orders", "layout");
    return { message: "شكراً على تقييمك." };
  } catch (error) {
    return failure(error);
  }
}
