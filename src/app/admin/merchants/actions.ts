"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { reviewMerchant, setMerchantTier } from "@/server/merchants/service";

const reviewSchema = z.object({
  merchantId: z.string().min(1).max(64),
  action: z.enum(["APPROVE", "REJECT", "SUSPEND", "REACTIVATE"]),
  reason: z.string().trim().max(300).optional(),
});

const tierSchema = z.object({
  merchantId: z.string().min(1).max(64),
  tier: z.enum(["REGULAR", "BUSINESS"]),
  reason: z.string().trim().min(3).max(300),
});

function back(notice: string): never {
  revalidatePath("/admin/merchants");
  redirect(`/admin/merchants?notice=${notice}`);
}

export async function reviewMerchantAction(formData: FormData): Promise<void> {
  const { user } = await requirePermission("merchants.review");
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("invalid");
  try {
    const result = await reviewMerchant(user, parsed.data.merchantId, parsed.data.action, parsed.data.reason);
    if (!result.ok) back(result.error === "REASON_REQUIRED" ? "reason" : "transition");
  } catch (error) {
    if (error instanceof AuthorizationError) back("forbidden");
    if (error instanceof NotFoundError) back("missing");
    throw error;
  }
  back("done");
}

export async function setTierAction(formData: FormData): Promise<void> {
  const { user } = await requirePermission("merchants.review");
  const parsed = tierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("reason");
  try {
    await setMerchantTier(user, parsed.data.merchantId, parsed.data.tier, parsed.data.reason);
  } catch (error) {
    if (error instanceof AuthorizationError) back("forbidden");
    if (error instanceof NotFoundError) back("missing");
    throw error;
  }
  back("done");
}
