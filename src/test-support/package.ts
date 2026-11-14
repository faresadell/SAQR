import { db } from "@/lib/db";

/** Integration-test helper: gives a merchant owner a running package so the shop may take orders and publish offers. */
export async function grantPackage(userId: string): Promise<void> {
  const plan = await db.plan.upsert({ where: { code: "test_gate_plan" }, update: {}, create: { code: "test_gate_plan", audience: "MERCHANT", nameAr: "باقة اختبار", priceCents: 10000, baseStars: 100, bonusStars: 0, offerQuota: 100, isActive: false, sortOrder: 999 } });
  const now = new Date();
  await db.subscription.upsert({ where: { userId }, update: {}, create: { userId, planId: plan.id, startsAt: now, expiresAt: new Date(now.getTime() + 30 * 86_400_000) } });
}
