"use server";

import { getClientIp } from "@/lib/client-ip";
import type { FormState } from "@/lib/form-state";
import { createFirstAdmin } from "@/server/auth/bootstrap-admin";

export interface SetupState extends FormState {
  done?: true;
}

const text = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};

export async function setupAdminAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  try {
    const result = await createFirstAdmin(
      { token: text(formData, "token").trim(), email: text(formData, "email").trim(), phone: text(formData, "phone").trim(), name: text(formData, "name"), password: text(formData, "password") },
      await getClientIp(),
    );
    if (result.ok) return { done: true };
    const map: Record<string, SetupState> = {
      DISABLED: { error: "الصفحة غير مفعّلة." },
      ALREADY_SETUP: { error: "تم إنشاء مدير بالفعل. هذه الصفحة أُغلقت." },
      RATE_LIMITED: { error: "محاولات كثيرة. حاول لاحقاً." },
      WRONG_TOKEN: { fieldErrors: { token: "الكود السري غير صحيح." } },
      INVALID_EMAIL: { fieldErrors: { email: "اكتب إيميلاً صحيحاً." } },
      INVALID_PHONE: { fieldErrors: { phone: "اكتب رقم موبايل مصري صحيح." } },
      INVALID_NAME: { fieldErrors: { name: "اكتب اسماً من حرفين إلى 60 حرفاً." } },
      SHORT_PASSWORD: { fieldErrors: { password: "كلمة المرور لازم تكون 12 حرفاً على الأقل." } },
      WEAK_PASSWORD: { fieldErrors: { password: "كلمة المرور ضعيفة. استخدم حروفاً وأرقاماً ولا تستخدم رقمك أو كلمة شائعة." } },
    };
    return map[result.error] ?? { error: "تعذر الإنشاء." };
  } catch (error) {
    console.error("setup failed");
    void error;
    return { error: "حدث خطأ غير متوقع." };
  }
}
