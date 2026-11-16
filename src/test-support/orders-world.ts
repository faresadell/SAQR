/** Shared fixture for the order integration tests: a customer, two approved shops (with package and payment account), one delivery zone, settings and stars. */
import { giveAccount, grantPackage } from "@/test-support/package";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { invalidateSettingsCache } from "@/lib/settings";
import { applyStarMove } from "@/server/stars/ledger";

export const past = new Date(Date.now() - 86_400_000);
let n = 0;

export async function user(role: "CUSTOMER" | "MERCHANT"): Promise<Actor> {
  n += 1;
  const u = await db.user.create({ data: { phone: `+2011${String(n).padStart(8, "0")}`, name: `U${n}`, passwordHash: "x", role, status: "ACTIVE" } });
  return { id: u.id, role, isSuperAdmin: false, permissions: [] };
}

export async function giveStars(userId: string, amount: number, key: string) {
  await db.$transaction((tx) => applyStarMove(tx, { userId, amount, reason: "PURCHASE", idempotencyKey: key }));
}

export async function shop(owner: Actor, name: string, price: number) {
  const m = await db.merchant.create({ data: { ownerId: owner.id, name, businessType: "restaurant", status: "APPROVED" } });
  await grantPackage(owner.id);
  await giveAccount(m.id);
  const category = await db.category.findFirstOrThrow();
  const p = await db.product.create({ data: { merchantId: m.id, categoryId: category.id, nameAr: `منتج ${name}`, priceCents: price } });
  return { merchant: m, product: p };
}

export async function setting(key: string, value: number) {
  await db.platformSettingVersion.create({ data: { key, value: { v: value }, effectiveFrom: past, createdById: "test" } });
  invalidateSettingsCache();
}

export interface World {
  customer: Actor;
  ownerA: Actor;
  ownerB: Actor;
  a: Awaited<ReturnType<typeof shop>>;
  b: Awaited<ReturnType<typeof shop>>;
  addressId: string;
}

export async function world(): Promise<World> {
  await db.businessType.create({ data: { code: "restaurant", nameAr: "مطعم" } });
  await db.category.create({ data: { nameAr: "عام" } });
  await db.commissionRate.createMany({ data: [{ tier: "REGULAR", basisPoints: 800, effectiveFrom: past, createdById: "t" }, { tier: "BUSINESS", basisPoints: 500, effectiveFrom: past, createdById: "t" }] });
  await db.paymentMethodConfig.create({ data: { code: "instapay", nameAr: "انستا باي", isEnabled: true, receiverNumber: "01000000000" } });
  await setting("orders.merchant_response_minutes", 30);
  const zone = await db.deliveryZone.create({ data: { name: "المعادي" } });
  await db.deliveryFeeVersion.create({ data: { zoneId: zone.id, feeCents: 2000, effectiveFrom: past, createdById: "t" } });
  const customer = await user("CUSTOMER");
  const ownerA = await user("MERCHANT");
  const ownerB = await user("MERCHANT");
  const address = await db.address.create({ data: { userId: customer.id, line: "شارع 9", zoneId: zone.id } });
  for (const [u, k] of [[customer, "c"], [ownerA, "a"], [ownerB, "b"]] as const) await giveStars(u.id, 20, `seed:${k}:${u.id}`);
  return { customer, ownerA, ownerB, a: await shop(ownerA, "A", 5000), b: await shop(ownerB, "B", 3000), addressId: address.id };
}
