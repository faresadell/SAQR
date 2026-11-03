"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { requirePermission } from "@/server/auth/guards";
import { adminArchiveProduct, adminCreateProduct, adminRestoreProduct, adminSetProductAvailability, adminUpdateProduct, type AdminProductResult } from "@/server/catalog/admin-products";
import { AuthorizationError, NotFoundError } from "@/server/errors";

const GENERIC = "حدث خطأ غير متوقع. حاول مرة أخرى.";
const id = z.string().min(1).max(64);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function product(formData: FormData) {
  return { name: text(formData, "name"), description: text(formData, "description"), price: text(formData, "price"), categoryId: text(formData, "categoryId"), isAvailable: formData.get("isAvailable") === "on" };
}

function outcome(result: AdminProductResult, done: string): FormState {
  if (result.ok) {
    revalidatePath("/admin/products");
    revalidatePath("/", "layout");
    return { message: done };
  }
  switch (result.error) {
    case "INVALID": return { fieldErrors: result.errors };
    case "CATEGORY_UNAVAILABLE": return { fieldErrors: { categoryId: "هذا التصنيف غير متاح للعملاء." } };
    case "SHOP_NOT_APPROVED": return { error: "النشاط غير معتمد بعد." };
    case "REASON_REQUIRED": return { fieldErrors: { reason: "اكتب سبباً من 3 إلى 300 حرف." } };
  }
}

function failure(error: unknown): FormState {
  if (error instanceof AuthorizationError) return { error: "ليست لديك صلاحية لهذا الإجراء." };
  if (error instanceof NotFoundError) return { error: "المنتج أو النشاط غير موجود." };
  console.error(error);
  return { error: GENERIC };
}

export async function adminProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePermission("catalog.manage");
  const command = text(formData, "command");
  try {
    if (command === "create") {
      const shop = id.safeParse(text(formData, "merchantId"));
      if (!shop.success) return { fieldErrors: { merchantId: "اختر النشاط." } };
      return outcome(await adminCreateProduct(user, shop.data, product(formData)), "تمت إضافة المنتج.");
    }
    const productId = id.safeParse(text(formData, "productId"));
    if (!productId.success) return { error: GENERIC };
    switch (command) {
      case "update": return outcome(await adminUpdateProduct(user, productId.data, product(formData)), "تم حفظ التعديل.");
      case "show":
      case "hide":
        await adminSetProductAvailability(user, productId.data, command === "show");
        return outcome({ ok: true }, command === "show" ? "أصبح المنتج متاحاً." : "أصبح المنتج غير متاح.");
      case "archive": return outcome(await adminArchiveProduct(user, productId.data, text(formData, "reason")), "تم سحب المنتج من الموقع.");
      case "restore":
        await adminRestoreProduct(user, productId.data);
        return outcome({ ok: true }, "تمت إعادة المنتج (غير متاح حتى تفعّله).");
      default: return { error: GENERIC };
    }
  } catch (error) {
    return failure(error);
  }
}
