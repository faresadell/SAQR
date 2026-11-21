import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/permissions";
import { hasEverHadPackage } from "@/server/plans/service";
import { shopHasPaymentAccount } from "@/server/payments/merchant-accounts";
import { isOpenAt, validateOpeningHours } from "@/lib/catalog/opening-hours";
import { buildCheckoutQuote, type CartLineInput, type CheckoutError, type CheckoutQuote, type PricedProduct } from "@/lib/orders/checkout";
import { resolveZoneFee, ZoneUnavailableError } from "@/server/delivery/zones";
import { getSetting } from "@/lib/settings";
import { AuthorizationError } from "@/server/errors";
import { buildCommissionSnapshot } from "@/server/commissions/service";
import { resolveOfferDiscounts } from "@/server/offers/service";
import { getStarBalance } from "@/server/stars/ledger";
import { notifyInTx } from "@/server/notifications/service";
import { couponDiscounts } from "@/lib/coupons/discount";
import { findUsableCoupon, type UsableCoupon } from "@/server/coupons/service";

export type PlaceOrderError =
  | CheckoutError
  | "INVALID_REQUEST"
  | "ACCOUNT_NOT_ACTIVE"
  | "ADDRESS_NOT_FOUND"
  | "ZONE_UNAVAILABLE"
  | "TRADING_NOT_CONFIGURED"
  | "CUSTOMER_STARS_TOO_LOW"
  | "MERCHANT_UNAVAILABLE"
  | "COUPON_INVALID"
  | "COUPON_EXPIRED"
  | "COUPON_NOT_FOR_CART";

export type PlaceOrderResult =
  | { ok: true; parentOrderId: string; suborderIds: string[]; quote: CheckoutQuote; replayed: boolean }
  | { ok: false; error: PlaceOrderError; productId?: string; merchantId?: string };

export interface PlaceOrderInput {
  /** Client-generated, 8-64 chars. The same key always returns the same parent order (safe to retry). */
  idempotencyKey: string;
  addressId: string;
  lines: CartLineInput[];
  /** Optional discount code. Checked and priced here, inside the order transaction. */
  couponCode?: string | undefined;
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

class Abort extends Error {
  constructor(readonly failure: Extract<PlaceOrderResult, { ok: false }>) {
    super(failure.error);
  }
}

async function existingParent(customerId: string, idempotencyKey: string): Promise<PlaceOrderResult | null> {
  const parent = await db.parentOrder.findUnique({
    where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
    include: { suborders: { select: { id: true } } },
  });
  if (!parent) return null;
  return {
    ok: true,
    replayed: true,
    parentOrderId: parent.id,
    suborderIds: parent.suborders.map((s) => s.id),
    quote: { suborders: [], subtotalCents: parent.subtotalCents, deliveryFeeCents: parent.deliveryFeeCents, totalCents: parent.totalCents },
  };
}

/**
 * Everything about the customer and the delivery address that must hold before any order is created (cart checkout and an
 * accepted custom-request quote share it). Returns the first failure instead of throwing.
 */
export async function resolveOrderContext(tx: Prisma.TransactionClient, customerId: string, addressId: string, now: Date) {
  const user = await tx.user.findUnique({ where: { id: customerId } });
  if (!user || user.status !== "ACTIVE" || user.role !== "CUSTOMER") return { ok: false, error: "ACCOUNT_NOT_ACTIVE" } as const;
  // Trading stays closed until the business sets the merchant response window (docs/PHASE2.md, decision 4).
  if ((await getSetting("orders.merchant_response_minutes")) === null) return { ok: false, error: "TRADING_NOT_CONFIGURED" } as const;
  const minCustomer = await getSetting("stars.min_balance_customer");
  if ((await getStarBalance(tx, customerId)) < minCustomer) return { ok: false, error: "CUSTOMER_STARS_TOO_LOW" } as const;
  const address = await tx.address.findFirst({ where: { id: addressId, userId: customerId } }); // owner-scoped (IDOR)
  if (!address) return { ok: false, error: "ADDRESS_NOT_FOUND" } as const;
  // Addresses carry no zone any more: there are no fixed delivery prices. The driver names the price after taking the order and the
  // customer agrees to it (cash, to the driver). Only an old address that still has a zone keeps that zone's reference fee.
  if (!address.zoneId) return { ok: true, address, zone: { zoneId: null, feeCents: 0, feeVersionId: null } } as const;
  try {
    const zone = await resolveZoneFee(address.zoneId, now, tx);
    return { ok: true, address, zone } as const;
  } catch (error) {
    if (error instanceof ZoneUnavailableError) return { ok: false, error: "ZONE_UNAVAILABLE" } as const;
    throw error;
  }
}

/** A shop can take orders only if it is approved, its owner active, it is open now, its owner has stars and has bought a package. */
export async function merchantCanTrade(tx: Prisma.TransactionClient, merchant: { id: string; status: string; ownerId: string; openingHours: Prisma.JsonValue | null; owner: { status: string } }, now: Date): Promise<boolean> {
  const minMerchant = await getSetting("stars.min_balance_merchant");
  const hours = merchant.openingHours === null ? null : validateOpeningHours(merchant.openingHours);
  return (
    merchant.status === "APPROVED" &&
    merchant.owner.status === "ACTIVE" &&
    isOpenAt(hours?.ok ? hours.value : null, now) &&
    (await getStarBalance(tx, merchant.ownerId)) >= minMerchant &&
    (await hasEverHadPackage(merchant.ownerId, tx)) && // no package yet = nobody can order from this shop
    (await shopHasPaymentAccount(merchant.id, tx)) // customers must have somewhere to pay
  );
}

/**
 * Creates one ParentOrder and one suborder per merchant, all in ONE transaction: either everything is stored or nothing is.
 * Every price, fee, merchant tier and commission is read here on the server; nothing financial comes from the client.
 */
export async function placeOrder(actor: Actor, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (actor.role !== "CUSTOMER") throw new AuthorizationError();
  if (!KEY_PATTERN.test(input.idempotencyKey) || typeof input.addressId !== "string" || !Array.isArray(input.lines)) {
    return { ok: false, error: "INVALID_REQUEST" };
  }
  const replay = await existingParent(actor.id, input.idempotencyKey);
  if (replay) return replay;

  try {
    return await db.$transaction(async (tx): Promise<PlaceOrderResult> => {
      const fail = (error: PlaceOrderError, extra: { productId?: string; merchantId?: string } = {}): never => {
        throw new Abort({ ok: false, error, ...extra });
      };
      const now = new Date();

      const context = await resolveOrderContext(tx, actor.id, input.addressId, now);
      if (!context.ok) return fail(context.error);
      const { address, zone } = context;

      const ids = [...new Set(input.lines.map((l) => (typeof l?.productId === "string" ? l.productId : "")))].filter(Boolean);
      const rows = await tx.product.findMany({
        where: { id: { in: ids } },
        include: { merchant: { include: { owner: true } }, category: { include: { parent: true } } },
      });

      // A product is only purchasable if its shop is approved, open, and its category is visible.
      const merchantOk = new Map<string, boolean>();
      const products = new Map<string, PricedProduct>();
      for (const row of rows) {
        let ok = merchantOk.get(row.merchantId);
        if (ok === undefined) {
          ok = await merchantCanTrade(tx, row.merchant, now);
          merchantOk.set(row.merchantId, ok);
        }
        const categoryVisible = row.category.isActive && !row.category.archivedAt && (!row.category.parent || (row.category.parent.isActive && !row.category.parent.archivedAt));
        products.set(row.id, {
          id: row.id,
          merchantId: row.merchantId,
          nameAr: row.nameAr,
          priceCents: row.priceCents,
          isAvailable: row.isAvailable && ok && categoryVisible,
          isArchived: row.archivedAt !== null,
        });
      }

      // Running offers: the discount is decided here, on the server, from fresh prices inside this transaction.
      const discounts = await resolveOfferDiscounts(tx, rows.map((r) => ({ id: r.id, priceCents: r.priceCents })), now);
      for (const [id, d] of discounts) {
        const priced = products.get(id);
        if (priced) products.set(id, { ...priced, unitDiscountCents: d.unitDiscountCents, offerId: d.offerId });
      }

      // Distinguish "shop cannot trade now" from a merely paused product for a clearer message.
      for (const line of input.lines) {
        const p = products.get(line.productId);
        if (p && merchantOk.get(p.merchantId) === false) fail("MERCHANT_UNAVAILABLE", { productId: p.id, merchantId: p.merchantId });
      }

      const built = buildCheckoutQuote({ lines: input.lines, products, feeForMerchant: () => zone.feeCents });
      if (!built.ok) return fail(built.error, built.productId ? { productId: built.productId } : {});
      const quote = built.quote;

      // Coupon: found and priced on the server from the fresh subtotals. A bad code stops the order (the customer is told, nothing is created).
      let coupon: UsableCoupon | null = null;
      let off = new Map<string, number>();
      if (input.couponCode) {
        const found = await findUsableCoupon(tx, input.couponCode, quote.suborders.map((s) => s.merchantId), now);
        if (!found.ok) return fail(found.error as PlaceOrderError);
        coupon = found.coupon;
        off = couponDiscounts(coupon, quote.suborders);
      }
      const totalOff = [...off.values()].reduce((n, v) => n + v, 0);

      const parent = await tx.parentOrder.create({
        data: {
          customerId: actor.id,
          idempotencyKey: input.idempotencyKey,
          subtotalCents: quote.subtotalCents,
          deliveryFeeCents: quote.deliveryFeeCents,
          discountCents: totalOff,
          totalCents: quote.totalCents - totalOff,
          addressSnap: { label: address.label, line: address.line, lat: address.lat, lng: address.lng, zoneId: zone.zoneId },
        },
      });

      const suborderIds: string[] = [];
      for (const sub of quote.suborders) {
        const merchant = rows.find((r) => r.merchantId === sub.merchantId)!.merchant;
        const commission = await buildCommissionSnapshot(merchant.tier, sub.subtotalCents, now, tx);
        const order = await tx.order.create({
          data: {
            parentOrderId: parent.id,
            customerId: actor.id,
            merchantId: sub.merchantId,
            subtotalCents: sub.subtotalCents,
            deliveryFeeCents: sub.deliveryFeeCents,
            discountCents: off.get(sub.merchantId) ?? 0,
            ...((off.get(sub.merchantId) ?? 0) > 0 && coupon ? { couponCode: coupon.code, couponFundedBy: coupon.merchantId ? "MERCHANT" : "PLATFORM" } : {}),
            totalCents: sub.totalCents - (off.get(sub.merchantId) ?? 0),
            merchantTierSnap: commission.merchantTierSnap,
            commissionBp: commission.commissionBp,
            commissionBaseCents: commission.commissionBaseCents,
            commissionCents: commission.commissionCents,
            deliveryRuleSnap: { zoneId: zone.zoneId, feeVersionId: zone.feeVersionId, feeCents: zone.feeCents },
            addressSnap: { label: address.label, line: address.line, lat: address.lat, lng: address.lng, zoneId: zone.zoneId },
            items: {
              create: sub.items.map((i) => ({
                productId: i.productId,
                nameSnapshot: i.nameSnapshot,
                unitPriceCents: i.unitPriceCents,
                unitDiscountCents: i.unitDiscountCents,
                discountCents: i.discountCents,
                offerId: i.offerId,
                quantity: i.quantity,
                lineTotalCents: i.lineTotalCents,
              })),
            },
            events: { create: [{ field: "orderStatus", toValue: "AWAITING_PAYMENT", actorId: actor.id, note: "created" }] },
          },
        });
        suborderIds.push(order.id);
        // The shop hears about the order the moment it is placed (it can act once the customer's transfer proof arrives).
        await notifyInTx(tx, { userId: merchant.ownerId, type: "ORDER_PLACED", title: "طلب جديد", body: `وصل طلب جديد رقم ${order.number}. بانتظار تحويل العميل وإرسال الإيصال، وسيصلك إشعار بذلك.`, data: { orderId: order.id }, dedupeKey: `order-placed:${order.id}` });
      }

      await writeAudit({ actorId: actor.id, action: "ORDER_PLACED", entityType: "ParentOrder", entityId: parent.id, after: { suborders: suborderIds, totalCents: quote.totalCents } }, tx);
      return { ok: true, parentOrderId: parent.id, suborderIds, quote: { ...quote, totalCents: quote.totalCents - totalOff }, replayed: false };
    });
  } catch (error) {
    if (error instanceof Abort) return error.failure; // the transaction was rolled back: nothing was stored
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await existingParent(actor.id, input.idempotencyKey); // a concurrent retry won the race
      if (again) return again;
    }
    throw error;
  }
}
