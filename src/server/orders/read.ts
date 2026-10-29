import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { NotFoundError } from "@/server/errors";

// Public shape of a suborder. The receipt storage key and internal flags are deliberately NOT included.
const orderSelect = {
  id: true,
  number: true,
  parentOrderId: true,
  merchantId: true,
  orderStatus: true,
  paymentStatus: true,
  refundStatus: true,
  deliveryStatus: true,
  subtotalCents: true,
  deliveryFeeCents: true,
  totalCents: true,
  addressSnap: true,
  cancelReason: true,
  createdAt: true,
  items: { select: { productId: true, nameSnapshot: true, unitPriceCents: true, quantity: true, lineTotalCents: true } },
  payments: { select: { id: true, method: true, referenceNo: true, amountCents: true, submittedAt: true, confirmedAt: true, rejectedReason: true } },
} satisfies Prisma.OrderSelect;

/** Rows an actor may see. Customers see their own, shop owners their shop's, admins with orders.view all. */
function visibility(actor: Actor): Prisma.OrderWhereInput {
  if (actor.role === "CUSTOMER") return { customerId: actor.id };
  if (actor.role === "MERCHANT") return { merchant: { ownerId: actor.id } };
  if (hasPermission(actor, "orders.view")) return {};
  return { id: "__none__" };
}

export async function getOrderForActor(actor: Actor, orderId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, ...visibility(actor) }, select: orderSelect });
  if (!order) throw new NotFoundError();
  return order;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Newest first, cursor = id of the last row of the previous page. */
export async function listOrdersForActor(actor: Actor, opts: { cursor?: string; limit?: number; status?: string } = {}): Promise<Page<Awaited<ReturnType<typeof getOrderForActor>>>> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const rows = await db.order.findMany({
    where: { ...visibility(actor), ...(opts.status ? { orderStatus: opts.status as never } : {}) },
    select: orderSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items[items.length - 1]?.id ?? null) : null };
}
