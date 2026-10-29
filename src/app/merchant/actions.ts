"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseHoursFields } from "@/lib/catalog/opening-hours";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/auth/guards";
import { archiveProduct, createProduct, setProductAvailability, updateProduct } from "@/server/catalog/products";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { resubmitOwnMerchant, saveOwnMerchant } from "@/server/merchants/service";

const GENERIC = "حدث خطأ غير متوقع. حاول مرة أخرى.";
const DENIED = "غير مسموح. تأكد أن نشاطك معتمد.";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function failure(error: unknown): FormState {
  if (error instanceof AuthorizationError) return { error: DENIED };
  if (error instanceof NotFoundError) return { error: "العنصر غير موجود." };
  console.error(error);
  return { error: GENERIC };
}

// ───────────── shop profile ─────────────

export async function saveMerchantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  try {
    const hours = parseHoursFields((name) => text(formData, name));
    const result = await saveOwnMerchant(
      user,
      {
        name: text(formData, "name"),
        description: text(formData, "description"),
        businessType: text(formData, "businessType"),
        phone: text(formData, "phone"),
        address: text(formData, "address"),
        lat: text(formData, "lat"),
        lng: text(formData, "lng"),
      },
      hours.ok ? hours.value : {}, // {} fails validation inside the service, so bad hours are reported there
    );
    if (!result.ok) {
      if (result.error === "LOCKED") return { error: "لا يمكن تعديل البيانات في حالتها الحالية." };
      return { fieldErrors: result.errors };
    }
    revalidatePath("/merchant");
    return { message: result.created ? "تم إرسال نشاطك للمراجعة. سنخبرك بالنتيجة." : "تم حفظ التعديلات." };
  } catch (error) {
    return failure(error);
  }
}

export async function resubmitMerchantAction(): Promise<void> {
  const { user } = await requireRole("MERCHANT");
  await resubmitOwnMerchant(user);
  revalidatePath("/merchant");
  redirect("/merchant");
}

// ───────────── products ─────────────

const idSchema = z.string().min(1).max(64);

function productFields(formData: FormData) {
  return {
    name: text(formData, "name"),
    description: text(formData, "description"),
    price: text(formData, "price"),
    categoryId: text(formData, "categoryId"),
    isAvailable: formData.get("isAvailable") === "on",
  };
}

function productFailure(result: Awaited<ReturnType<typeof createProduct>>): FormState {
  if (result.ok) return { message: "تم الحفظ." };
  if (result.error === "CATEGORY_UNAVAILABLE") return { fieldErrors: { categoryId: "هذا التصنيف غير متاح." } };
  return { fieldErrors: result.errors };
}

export async function createProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  try {
    const result = await createProduct(user, productFields(formData));
    if (result.ok) revalidatePath("/merchant");
    return result.ok ? { message: "تمت إضافة المنتج." } : productFailure(result);
  } catch (error) {
    return failure(error);
  }
}

export async function updateProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  try {
    const id = idSchema.safeParse(formData.get("productId"));
    if (!id.success) return { error: GENERIC };
    const result = await updateProduct(user, id.data, productFields(formData));
    if (result.ok) revalidatePath("/merchant");
    return productFailure(result);
  } catch (error) {
    return failure(error);
  }
}

async function productCommand(formData: FormData, run: (userId: Awaited<ReturnType<typeof requireRole>>["user"], id: string) => Promise<void>): Promise<void> {
  const { user } = await requireRole("MERCHANT");
  const id = idSchema.safeParse(formData.get("productId"));
  if (!id.success) redirect("/merchant");
  try {
    await run(user, id.data);
  } catch (error) {
    if (!(error instanceof AuthorizationError || error instanceof NotFoundError)) throw error;
  }
  revalidatePath("/merchant");
  redirect("/merchant");
}

export async function toggleAvailabilityAction(formData: FormData): Promise<void> {
  const next = formData.get("available") === "true";
  await productCommand(formData, (user, id) => setProductAvailability(user, id, next));
}

export async function archiveProductAction(formData: FormData): Promise<void> {
  await productCommand(formData, (user, id) => archiveProduct(user, id));
}
