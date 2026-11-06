"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { clearAvatar, setAvatar } from "@/server/auth/avatar";
import { requireUser } from "@/server/auth/guards";
import { GENERIC_ERROR } from "./messages";

export async function setAvatarAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const raw = formData.get("image");
  try {
    if (formData.get("remove") === "1") {
      await clearAvatar(user.id);
      revalidatePath("/settings", "layout");
      return { message: "تم حذف الصورة." };
    }
    const result = await setAvatar(user.id, typeof raw === "string" ? raw : "");
    if (!result.ok) return { error: "الصورة غير صالحة. اختر صورة JPG أو PNG أو WebP." };
    revalidatePath("/settings", "layout");
    return { message: "تم حفظ الصورة." };
  } catch (error) {
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}
