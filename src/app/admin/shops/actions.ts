"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { requirePermission } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { createShopByAdmin, updateShopByAdmin, type AdminShopInput } from "@/server/merchants/admin-shops";

const GENERIC = "حدث خطأ غير متوقع. حاول مرة أخرى.";

function text(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

function input(formData: FormData): AdminShopInput {
  const keys = ["name", "description", "businessType", "phone", "address", "lat", "lng", "phones", "facebook", "instagram", "tiktok", "whatsapp", "website"] as const;
  return Object.fromEntries(keys.map((k) => [k, text(formData, k)])) as AdminShopInput;
}

function failure(error: unknown): FormState {
  if (error instanceof AuthorizationError) return { error: "ليست لديك صلاحية لهذا الإجراء." };
  if (error instanceof NotFoundError) return { error: "النشاط غير موجود." };
  console.error(error);
  return { error: GENERIC };
}

export async function createShopAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePermission("merchants.review");
  let id: string;
  try {
    const result = await createShopByAdmin(user, text(formData, "ownerId"), input(formData));
    if (!result.ok) return { fieldErrors: result.errors as Record<string, string> };
    id = result.id;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/merchants");
  revalidatePath("/explore");
  redirect(`/admin/shops/${id}?created=1`);
}

export async function updateShopAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePermission("merchants.review");
  try {
    const result = await updateShopByAdmin(user, text(formData, "merchantId"), input(formData));
    if (!result.ok) return { fieldErrors: result.errors as Record<string, string> };
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/merchants");
  revalidatePath("/explore");
  revalidatePath(`/shops/${text(formData, "merchantId")}`);
  return { message: "تم حفظ بيانات النشاط وتسجيل التعديل في سجل المراجعة." };
}
