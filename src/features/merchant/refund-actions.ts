"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { uploadRefundProof } from "@/server/orders/receipts";
import { submitRefundProof } from "@/server/refunds/service";
import { ADMIN_MESSAGES, DENIED_ERROR, GENERIC_ERROR, NOT_FOUND_ERROR, UPLOAD_MESSAGES } from "@/features/shared/messages";

/** The shop sends the image of its transfer back to the customer. An administrator verifies it; nothing is marked refunded here. */
export async function submitRefundProofAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("MERCHANT");
  const get = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const file = formData.get("proof");
  if (!(file instanceof File) || file.size === 0) return { fieldErrors: { proof: "اختر صورة التحويل." } };
  try {
    const upload = await uploadRefundProof(user, get("orderId"), new Uint8Array(await file.arrayBuffer()));
    if (!upload.ok) return { error: UPLOAD_MESSAGES[upload.error] ?? GENERIC_ERROR };
    const result = await submitRefundProof(user, get("refundId"), upload.uploadId);
    if (!result.ok) return { error: ADMIN_MESSAGES[result.error] ?? GENERIC_ERROR };
    revalidatePath("/merchant/refunds");
    return { message: "تم إرسال الإثبات للمراجعة." };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
    if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
    console.error(error);
    return { error: GENERIC_ERROR };
  }
}
