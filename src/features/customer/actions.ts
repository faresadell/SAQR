"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { createAddress, deleteAddress } from "@/server/addresses/service";
import { requireRole } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { placeOrder } from "@/server/orders/checkout";
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

export async function addAddressAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER");
  try {
    const result = await createAddress(user, { label: text(formData, "label") || null, line: text(formData, "line"), zoneId: text(formData, "zoneId") });
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
    const result = await submitPayment(user, orderId, { method: text(formData, "method"), referenceNo: text(formData, "referenceNo"), uploadId: upload.uploadId });
    if (!result.ok) return { error: LIFECYCLE_MESSAGES[result.error] ?? GENERIC_ERROR };
    revalidatePath("/account/orders", "layout");
    return { message: "تم إرسال الإيصال. بانتظار تأكيد النشاط للدفع." };
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
