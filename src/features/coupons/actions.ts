"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireUser } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { createCoupon, setCouponActive } from "@/server/coupons/service";
import { DENIED_ERROR, GENERIC_ERROR, NOT_FOUND_ERROR } from "@/features/shared/messages";

const MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "راجع البيانات: الكود 4–20 حرفاً إنجليزياً أو أرقاماً، النسبة من 1 إلى 30%، والقيمة الثابتة من 1 إلى 100 جنيه، وتاريخ الانتهاء في المستقبل (حتى سنة).",
  CODE_TAKEN: "هذا الكود مستخدم. اختر كوداً آخر.",
  SHOP_NOT_APPROVED: "يمكنك إنشاء كوبونات بعد اعتماد نشاطك.",
  TOO_MANY_COUPONS: "وصلت للحد الأقصى من الكوبونات الفعّالة. أوقف بعضها أولاً.",
};

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createCouponAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const kind = str(formData, "kind") === "FIXED" ? "FIXED" : "PERCENT";
  const raw = Number(str(formData, "value"));
  const value = kind === "FIXED" ? Math.round(raw * 100) : raw; // fixed amounts are typed in pounds
  const day = str(formData, "expires");
  const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T23:59:59+02:00`) : new Date(NaN); // end of that day, Cairo time
  try {
    const r = await createCoupon(user, { code: str(formData, "code"), kind, value, expiresAt });
    if (!r.ok) return { error: MESSAGES[r.error] ?? GENERIC_ERROR };
    revalidatePath("/merchant/coupons");
    revalidatePath("/admin/coupons");
    return { message: "تم إنشاء الكوبون." };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}

export async function setCouponActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  try {
    await setCouponActive(user, str(formData, "id"), str(formData, "active") === "1");
    revalidatePath("/merchant/coupons");
    revalidatePath("/admin/coupons");
    return { message: "تم التحديث." };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}
