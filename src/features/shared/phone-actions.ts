"use server";

import { revalidatePath } from "next/cache";
import { getClientIp } from "@/lib/client-ip";
import type { FormState } from "@/lib/form-state";
import { changeName } from "@/server/auth/change-name";
import { changePassword } from "@/server/auth/change-password";
import { changePhone } from "@/server/auth/change-phone";
import { requireUser } from "@/server/auth/guards";
import { GENERIC_ERROR } from "./messages";

const text = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};

export async function changePhoneAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  try {
    const result = await changePhone(user, text(formData, "phone").trim(), text(formData, "password"), await getClientIp());
    if (!result.ok) {
      const map = {
        INVALID_PHONE: { fieldErrors: { phone: "اكتب رقم موبايل مصري صحيح (مثال: 01012345678)." } },
        WRONG_PASSWORD: { fieldErrors: { password: "كلمة المرور غير صحيحة." } },
        SAME_PHONE: { fieldErrors: { phone: "هذا هو رقمك الحالي." } },
        PHONE_TAKEN: { error: "هذا الرقم مسجَّل على حساب آخر." },
        RATE_LIMITED: { error: "محاولات كثيرة. حاول لاحقاً." },
      } satisfies Record<string, FormState>;
      return map[result.error];
    }
    for (const base of ["/account", "/merchant", "/driver", "/admin"]) revalidatePath(base, "layout");
    return { message: "تم تغيير الرقم. الرقم الجديد غير متحقق منه." };
  } catch (error) {
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}

export async function changeNameAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  try {
    const result = await changeName(user, text(formData, "name"));
    if (!result.ok) {
      return result.error === "SAME_NAME" ? { fieldErrors: { name: "هذا هو اسمك الحالي." } } : { fieldErrors: { name: "اكتب اسماً من حرفين إلى 60 حرفاً." } };
    }
    for (const base of ["/account", "/merchant", "/driver", "/admin"]) revalidatePath(base, "layout");
    return { message: "تم تحديث الاسم." };
  } catch (error) {
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}

const PASSWORD_MESSAGES = {
  TOO_SHORT: "كلمة المرور يجب ألا تقل عن 8 أحرف.",
  TOO_LONG: "كلمة المرور طويلة جداً.",
  ALL_DIGITS: "كلمة المرور لا يجب أن تكون أرقاماً فقط.",
  COMMON: "كلمة المرور شائعة وسهلة التخمين.",
  SAME_AS_PHONE: "كلمة المرور لا يجب أن تكون رقم الهاتف.",
  NEEDS_MIX: "كلمة المرور يجب أن تجمع حروفاً مع أرقام أو رموز.",
} as const;

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, sessionId } = await requireUser();
  try {
    const next = text(formData, "next");
    if (next !== text(formData, "confirm")) return { fieldErrors: { confirm: "كلمتا المرور غير متطابقتين." } };
    const result = await changePassword(user, sessionId, text(formData, "current"), next, await getClientIp());
    if (!result.ok) {
      if (result.error === "WRONG_PASSWORD") return { fieldErrors: { current: "كلمة المرور الحالية غير صحيحة." } };
      if (result.error === "SAME_PASSWORD") return { fieldErrors: { next: "اختر كلمة مرور مختلفة عن الحالية." } };
      if (result.error === "RATE_LIMITED") return { error: "محاولات كثيرة. حاول لاحقاً." };
      return { fieldErrors: { next: result.problem ? PASSWORD_MESSAGES[result.problem] : "كلمة المرور ضعيفة." } };
    }
    return { message: "تم تغيير كلمة المرور، وتم تسجيل خروجك من الأجهزة الأخرى." };
  } catch (error) {
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}
