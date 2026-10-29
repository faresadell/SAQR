"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { requirePermission } from "@/server/auth/guards";
import {
  archiveCategory,
  createBusinessType,
  createCategory,
  setBusinessTypeActive,
  setCategoryActive,
  updateCategory,
} from "@/server/catalog/categories";
import { AuthorizationError, NotFoundError } from "@/server/errors";

const GENERIC = "حدث خطأ غير متوقع. حاول مرة أخرى.";
const idSchema = z.string().min(1).max(64);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function categoryMessage(result: Awaited<ReturnType<typeof createCategory>>): FormState {
  if (result.ok) return { message: "تم الحفظ." };
  switch (result.error) {
    case "INVALID":
      return { fieldErrors: result.errors };
    case "DUPLICATE":
      return { fieldErrors: { nameAr: "يوجد تصنيف بنفس الاسم في هذا المستوى." } };
    case "PARENT_INVALID":
      return { error: "التصنيف الأب غير صالح (المسموح مستويان فقط)." };
    case "HAS_ACTIVE_CHILDREN":
      return { error: "لا يمكن أرشفة تصنيف له تصنيفات فرعية فعّالة." };
  }
}

function failure(error: unknown): FormState {
  if (error instanceof AuthorizationError) return { error: "ليست لديك صلاحية لهذا الإجراء." };
  if (error instanceof NotFoundError) return { error: "العنصر غير موجود." };
  console.error(error);
  return { error: GENERIC };
}

export async function createCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePermission("catalog.manage");
  try {
    const parent = text(formData, "parentId");
    const parentId = parent ? idSchema.safeParse(parent) : null;
    if (parentId && !parentId.success) return { error: GENERIC };
    const result = await createCategory(user, { nameAr: text(formData, "nameAr"), nameEn: text(formData, "nameEn"), sortOrder: text(formData, "sortOrder") }, parentId?.success ? parentId.data : null);
    if (result.ok) revalidatePath("/admin/catalog");
    return categoryMessage(result);
  } catch (error) {
    return failure(error);
  }
}

export async function updateCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePermission("catalog.manage");
  try {
    const id = idSchema.safeParse(formData.get("categoryId"));
    if (!id.success) return { error: GENERIC };
    const result = await updateCategory(user, id.data, { nameAr: text(formData, "nameAr"), nameEn: text(formData, "nameEn"), sortOrder: text(formData, "sortOrder") });
    if (result.ok) revalidatePath("/admin/catalog");
    return categoryMessage(result);
  } catch (error) {
    return failure(error);
  }
}

async function simpleCommand(run: () => Promise<void>, anchor: string): Promise<never> {
  let notice = "done";
  try {
    await run();
  } catch (error) {
    if (error instanceof AuthorizationError) notice = "forbidden";
    else if (error instanceof NotFoundError) notice = "missing";
    else throw error;
  }
  revalidatePath("/admin/catalog");
  redirect(`/admin/catalog?notice=${notice}#${anchor}`);
}

export async function setCategoryActiveAction(formData: FormData): Promise<void> {
  const { user } = await requirePermission("catalog.manage");
  const id = idSchema.safeParse(formData.get("categoryId"));
  if (!id.success) redirect("/admin/catalog?notice=invalid");
  const active = formData.get("active") === "true";
  await simpleCommand(() => setCategoryActive(user, id.data, active), "categories");
}

export async function archiveCategoryAction(formData: FormData): Promise<void> {
  const { user } = await requirePermission("catalog.manage");
  const id = idSchema.safeParse(formData.get("categoryId"));
  if (!id.success) redirect("/admin/catalog?notice=invalid");
  let notice = "done";
  try {
    const result = await archiveCategory(user, id.data);
    if (!result.ok) notice = "children";
  } catch (error) {
    if (error instanceof AuthorizationError) notice = "forbidden";
    else if (error instanceof NotFoundError) notice = "missing";
    else throw error;
  }
  revalidatePath("/admin/catalog");
  redirect(`/admin/catalog?notice=${notice}#categories`);
}

export async function createBusinessTypeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePermission("catalog.manage");
  try {
    const result = await createBusinessType(user, { code: text(formData, "code"), nameAr: text(formData, "nameAr") });
    if (result.ok) {
      revalidatePath("/admin/catalog");
      return { message: "تمت الإضافة." };
    }
    if (result.error === "DUPLICATE") return { fieldErrors: { code: "هذا الرمز مستخدم بالفعل." } };
    return { fieldErrors: result.errors ?? {} };
  } catch (error) {
    return failure(error);
  }
}

export async function setBusinessTypeActiveAction(formData: FormData): Promise<void> {
  const { user } = await requirePermission("catalog.manage");
  const code = z.string().min(1).max(40).safeParse(formData.get("code"));
  if (!code.success) redirect("/admin/catalog?notice=invalid");
  const active = formData.get("active") === "true";
  await simpleCommand(() => setBusinessTypeActive(user, code.data, active), "types");
}
