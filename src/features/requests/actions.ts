"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { acceptOrderQuote, closeOrderRequest, createOrderRequest, quoteOrderRequest, type RequestError } from "@/server/orders/requests";
import { DENIED_ERROR, GENERIC_ERROR, NOT_FOUND_ERROR } from "@/features/shared/messages";

const MESSAGES: Partial<Record<RequestError, string>> = {
  INVALID_REQUEST: "راجع البيانات المدخلة وحاول مرة أخرى.",
  RATE_LIMITED: "أرسلت طلبات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.",
  TOO_MANY_OPEN: "لديك 3 طلبات مفتوحة عند هذا النشاط بالفعل. انتظر ردّه أو ألغِ أحدها.",
  SHOP_UNAVAILABLE: "هذا النشاط غير متاح للطلب الآن.",
  ADDRESS_NOT_FOUND: "اختر عنوان توصيل صحيحاً.",
  ZONE_UNAVAILABLE: "منطقة التوصيل لهذا العنوان غير متاحة حالياً.",
  WRONG_STATE: "تغيّرت حالة هذا الطلب. حدّث الصفحة.",
  MERCHANT_UNAVAILABLE: "النشاط مغلق الآن أو لا يستقبل طلبات حالياً.",
  CUSTOMER_STARS_TOO_LOW: "رصيد نجومك لا يكفي لبدء طلب. اشحن نجومك أولاً.",
  TRADING_NOT_CONFIGURED: "الطلبات غير مفعّلة بعد من الإدارة.",
  ACCOUNT_NOT_ACTIVE: DENIED_ERROR,
};

const get = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
};

function failure(error: unknown): FormState {
  if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
  if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
  console.error(error);
  return { error: GENERIC_ERROR };
}

export async function createRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER");
  let id: string;
  try {
    const r = await createOrderRequest(user, { merchantId: get(formData, "merchantId"), addressId: get(formData, "addressId"), body: get(formData, "body") });
    if (!r.ok) return { error: MESSAGES[r.error] ?? GENERIC_ERROR };
    id = r.requestId;
  } catch (e) {
    return failure(e);
  }
  const chatId = get(formData, "chatId");
  redirect(chatId ? `/account/chats/${encodeURIComponent(chatId.slice(0, 64))}` : `/account/requests/${id}`); // asked from inside a chat: stay in the chat
}

export async function quoteRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  const egp = Number(get(formData, "price").replace(",", "."));
  if (!Number.isFinite(egp) || egp <= 0) return { fieldErrors: { price: "اكتب سعراً صحيحاً بالجنيه." } };
  try {
    const r = await quoteOrderRequest(user, get(formData, "requestId"), { subtotalCents: Math.round(egp * 100), note: get(formData, "note") || null });
    if (!r.ok) return { error: MESSAGES[r.error] ?? GENERIC_ERROR };
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/merchant/requests", "layout");
  revalidatePath("/merchant/chats", "layout");
  return { message: "تم إرسال السعر النهائي للعميل." };
}

/** Customer cancels, or the shop declines (the service decides by who is asking). */
export async function closeRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER", "MERCHANT");
  try {
    const r = await closeOrderRequest(user, get(formData, "requestId"));
    if (!r.ok) return { error: MESSAGES[r.error] ?? GENERIC_ERROR };
  } catch (e) {
    return failure(e);
  }
  revalidatePath(user.role === "CUSTOMER" ? "/account/requests" : "/merchant/requests", "layout");
  revalidatePath(user.role === "CUSTOMER" ? "/account/chats" : "/merchant/chats", "layout");
  return { message: "تم." };
}

export async function acceptQuoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER");
  let parentOrderId: string;
  try {
    const r = await acceptOrderQuote(user, get(formData, "requestId"));
    if (!r.ok) return { error: MESSAGES[r.error] ?? GENERIC_ERROR };
    parentOrderId = r.parentOrderId;
  } catch (e) {
    return failure(e);
  }
  redirect(`/account/orders/${parentOrderId}`); // the customer order page is keyed by the main order
}
