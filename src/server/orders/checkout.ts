import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/permissions";
import { isOpenAt, validateOpeningHours } from "@/lib/catalog/opening-hours";
import { buildCheckoutQuote, type CartLineInput, type CheckoutError, type CheckoutQuote, type PricedProduct } from "@/lib/orders/checkout";
import { getSetting } from "@/lib/settings";
import { AuthorizationError } from "@/server/errors";
import { buildCommissionSnapshot } from "@/server/commissions/service";
import { resolveZoneFee, ZoneUnavailableError } from "@/server/delivery/zones";
import { getStarBalance } from "@/server/stars/ledger";

export type PlaceOrderError =
  | CheckoutError
  | "INVALID_REQUEST"
  | "ACCOUNT_NOT_ACTIVE"
  | "ADDRESS_NOT_FOUND"
  | "ZONE_UNAVAILABLE"
  | "TRADING_NOT_CONFIGURED"
  | "CUSTOMER_STARS_TOO_LOW"
  | "MERCHANT_UNAVAILABLE";

export type PlaceOrderResult =
  | { ok: true; parentOrderId: string; suborderIds: string[]; quote: CheckoutQuote; replayed: boolean }
  | { ok: false; error: PlaceOrderError; productId?: string; merchantId?: string };

export interface PlaceOrderInput {
  /** Client-generated, 8-64 chars. The same key always returns the same parent order (safe to retry). */
  idempotencyKey: string;
  addressId: string;
  lines: CartLineInput[];
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

      const user = await tx.user.findUnique({ where: { id: actor.id } });
      if (!user || user.status !== "ACTIVE" || user.role !== "CUSTOMER") fail("ACCOUNT_NOT_ACTIVE");

      // Trading stays closed until the business sets the merchant response window (docs/PHASE2.md, decision 4).
      if ((await getSetting("orders.merchant_response_minutes")) === null) fail("TRADING_NOT_CONFIGURED");

      const minCustomer = await getSetting("stars.min_balance_customer");
      if ((await getStarBalance(tx, actor.id)) < minCustomer) fail("CUSTOMER_STARS_TOO_LOW");

      const address = await tx.address.findFirst({ where: { id: input.addressId, userId: actor.id } }); // owner-scoped (IDOR)
      if (!address) fail("ADDRESS_NOT_FOUND");
      if (!address!.zoneId) fail("ZONE_UNAVAILABLE");
      let zone: Awaited<ReturnType<typeof resolveZoneFee>>;
      try {
        zone = await resolveZoneFee(address!.zoneId!, now, tx);
      } catch (error) {
        if (error instanceof ZoneUnavailableError) return fail("ZONE_UNAVAILABLE");
        throw error;
      }

      const ids = [...new Set(input.lines.map((l) => (typeof l?.productId === "string" ? l.productId : "")))].filter(Boolean);
      const rows = await tx.product.findMany({
        where: { id: { in: ids } },
        include: { merchant: { include: { owner: true } }, category: { include: { parent: true } } },
      });

      // A product is only purchasable if its shop is approved, open, and its category is visible.
      const minMerchant = await getSetting("stars.min_balance_merchant");
      const merchantOk = new Map<string, boolean>();
      const products = new Map<string, PricedProduct>();
      for (const row of rows) {
        let ok = merchantOk.get(row.merchantId);
        if (ok === undefined) {
          const hours = row.merchant.openingHours === null ? null : validateOpeningHours(row.merchant.openingHours);
          ok =
            row.merchant.status === "APPROVED" &&
            row.merchant.owner.status === "ACTIVE" &&
            isOpenAt(hours?.ok ? hours.value : null, now) &&
            (await getStarBalance(tx, row.merchant.ownerId)) >= minMerchant;
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

      // Distinguish "shop cannot trade now" from a merely paused product for a clearer message.
      for (const line of input.lines) {
        const p = products.get(line.productId);
        if (p && merchantOk.get(p.merchantId) === false) fail("MERCHANT_UNAVAILABLE", { productId: p.id, merchantId: p.merchantId });
      }

      const built = buildCheckoutQuote({ lines: input.lines, products, feeForMerchant: () => zone.feeCents });
      if (!built.ok) return fail(built.error, built.productId ? { productId: built.productId } : {});
      const quote = built.quote;

      const parent = await tx.parentOrder.create({
        data: {
          customerId: actor.id,
          idempotencyKey: input.idempotencyKey,
          subtotalCents: quote.subtotalCents,
          deliveryFeeCents: quote.deliveryFeeCents,
          totalCents: quote.totalCents,
          addressSnap: { label: address!.label, line: address!.line, lat: address!.lat, lng: address!.lng, zoneId: zone.zoneId },
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
            totalCents: sub.totalCents,
            merchantTierSnap: commission.merchantTierSnap,
            commissionBp: commission.commissionBp,
            commissionBaseCents: commission.commissionBaseCents,
            commissionCents: commission.commissionCents,
            deliveryRuleSnap: { zoneId: zone.zoneId, feeVersionId: zone.feeVersionId, feeCents: zone.feeCents },
            addressSnap: { label: address!.label, line: address!.line, lat: address!.lat, lng: address!.lng, zoneId: zone.zoneId },
            items: {
              create: sub.items.map((i) => ({
                productId: i.productId,
                nameSnapshot: i.nameSnapshot,
                unitPriceCents: i.unitPriceCents,
                quantity: i.quantity,
                lineTotalCents: i.lineTotalCents,
              })),
            },
            events: { create: [{ field: "orderStatus", toValue: "AWAITING_PAYMENT", actorId: actor.id, note: "created" }] },
          },
        });
        suborderIds.push(order.id);
      }

      await writeAudit({ actorId: actor.id, action: "ORDER_PLACED", entityType: "ParentOrder", entityId: parent.id, after: { suborders: suborderIds, totalCents: quote.totalCents } }, tx);
      return { ok: true, parentOrderId: parent.id, suborderIds, quote, replayed: false };
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
