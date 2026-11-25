"use server";

import { logError } from "@/lib/log";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { addAccount, removeAccount, setAccountActive, type AccountError } from "@/server/payments/merchant-accounts";
import { GENERIC_ERROR, NOT_FOUND_ERROR } from "@/features/shared/messages";

const MESSAGES: Record<AccountError, string> = {
  INVALID_REQUEST: "راجع رقم الحساب. محفظة فودافون كاش رقم موبايل (11 رقم)، وإنستا باي عنوان أو رقم صحيح.",
  METHOD_NOT_AVAILABLE: "وسيلة الدفع دي غير مفعّلة حالياً.",
  TOO_MANY_ACCOUNTS: "وصلت للحد الأقصى من الحسابات. احذف حساباً قديماً أولاً.",
};

const text = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
};

function failure(error: unknown): FormState {
  if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
  if (error instanceof AuthorizationError) return { error: "غير مسموح." };
  logError(error);
  return { error: GENERIC_ERROR };
}

export async function addPaymentAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  try {
    const result = await addAccount(user, { method: text(formData, "method"), accountValue: text(formData, "accountValue"), holderName: text(formData, "holderName") });
    if (!result.ok) return { error: MESSAGES[result.error] };
    revalidatePath("/merchant/payment-accounts");
    return { message: "تمت إضافة الحساب. العملاء يقدروا يحوّلوا عليه دلوقتي." };
  } catch (error) {
    return failure(error);
  }
}

/** One action for the two row buttons: `intent` is "toggle" or "remove". */
export async function accountRowAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  try {
    const id = text(formData, "accountId");
    if (text(formData, "intent") === "remove") await removeAccount(user, id);
    else await setAccountActive(user, id, text(formData, "active") === "true");
    revalidatePath("/merchant/payment-accounts");
    return {};
  } catch (error) {
    return failure(error);
  }
}
