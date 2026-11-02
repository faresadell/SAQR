"use server";

import { getClientIp } from "@/lib/client-ip";
import { generateRecoveryCodes } from "@/server/auth/admin-recovery";
import { requireRole } from "@/server/auth/guards";

export interface RecoveryState {
  error?: string;
  codes?: string[];
}

/** Creates a fresh set of one-time recovery codes. The codes are returned once and never stored in readable form. */
export async function generateRecoveryAction(_prev: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const { user } = await requireRole("ADMIN");
  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) return { error: "اكتب كلمة المرور الحالية." };
  const result = await generateRecoveryCodes(user, password, await getClientIp());
  if (!result.ok) return { error: result.error === "RATE_LIMITED" ? "محاولات كثيرة. حاول لاحقاً." : "كلمة المرور غير صحيحة." };
  return { codes: result.codes };
}
