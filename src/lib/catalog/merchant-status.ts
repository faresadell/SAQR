export type MerchantStatusName = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type MerchantAction = "APPROVE" | "REJECT" | "SUSPEND" | "REACTIVATE" | "RESUBMIT";

interface Rule {
  from: readonly MerchantStatusName[];
  to: MerchantStatusName;
  needsReason: boolean;
}

/** The only legal moves between merchant states. Rejecting or suspending always needs a recorded reason. */
const RULES: Record<MerchantAction, Rule> = {
  APPROVE: { from: ["PENDING_REVIEW"], to: "APPROVED", needsReason: false },
  REJECT: { from: ["PENDING_REVIEW"], to: "REJECTED", needsReason: true },
  SUSPEND: { from: ["APPROVED"], to: "SUSPENDED", needsReason: true },
  REACTIVATE: { from: ["SUSPENDED"], to: "APPROVED", needsReason: false },
  RESUBMIT: { from: ["REJECTED"], to: "PENDING_REVIEW", needsReason: false },
};

export type TransitionResult = { ok: true; next: MerchantStatusName } | { ok: false; error: "INVALID_TRANSITION" | "REASON_REQUIRED" };

export function applyMerchantAction(current: MerchantStatusName, action: MerchantAction, reason?: string): TransitionResult {
  const rule = RULES[action];
  if (!rule.from.includes(current)) return { ok: false, error: "INVALID_TRANSITION" };
  if (rule.needsReason && (reason ?? "").trim().length < 3) return { ok: false, error: "REASON_REQUIRED" };
  return { ok: true, next: rule.to };
}
