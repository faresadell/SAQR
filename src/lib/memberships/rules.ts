// Merchant membership catalog defaults (seed values) and tier rules. Pure.
export type TierName = "REGULAR" | "BUSINESS";

export interface MembershipPlanDefinition {
  code: "plus" | "premium";
  nameAr: string;
  priceCents: number;
  tier: TierName;
  durationDays: number;
}

// Plus 30 EGP / Premium 60 EGP per month. Premium grants the 5% tier. Plus keeps the 8% tier: no Plus benefit was specified.
export const DEFAULT_MEMBERSHIP_PLANS: readonly MembershipPlanDefinition[] = [
  { code: "plus", nameAr: "بلس", priceCents: 3000, tier: "REGULAR", durationDays: 30 },
  { code: "premium", nameAr: "بريميوم", priceCents: 6000, tier: "BUSINESS", durationDays: 30 },
];

const RANK: Record<TierName, number> = { REGULAR: 0, BUSINESS: 1 };

/** A shop with an active higher tier may not buy a lower one: that would silently cut its remaining Premium time. */
export function canBuyTier(activeTier: TierName | null, wantedTier: TierName): boolean {
  return activeTier === null || RANK[wantedTier] >= RANK[activeTier];
}

/** The tier a shop falls back to when its paid time ends. */
export const FALLBACK_TIER: TierName = "REGULAR";
