"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requirePermission } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { approveLegalPage, updateLegalPage } from "@/server/legal/service";
import { DENIED_ERROR, GENERIC_ERROR, NOT_FOUND_ERROR } from "@/features/shared/messages";

const text = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};

const MESSAGES = { INVALID_REQUEST: "العنوان والنص مطلوبان (النص حتى 20000 حرف).", STALE_VERSION: "تغيّرت الصفحة منذ فتحتها. حدّث الصفحة ثم راجع التعديلات." } as const;

/** Saving creates a NEW version and removes any approval. The text is never shown as approved until someone approves that version. */
export async function saveLegalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePermission("content.manage");
  try {
    const result = await updateLegalPage(user, text(formData, "slug"), { title: text(formData, "title"), body: text(formData, "body"), expectedVersion: Number(text(formData, "version")) });
    if (!result.ok) return { error: MESSAGES[result.error] };
    revalidatePath("/admin/legal");
    revalidatePath("/legal", "layout");
    return { message: "تم الحفظ كمسودة جديدة. لن تُعرض كمعتمدة قبل اعتمادها." };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}

export async function approveLegalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePermission("content.manage");
  try {
    const result = await approveLegalPage(user, text(formData, "slug"), Number(text(formData, "version")));
    if (!result.ok) return { error: MESSAGES[result.error] };
    revalidatePath("/admin/legal");
    revalidatePath("/legal", "layout");
    return { message: "تم اعتماد هذه النسخة." };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}
