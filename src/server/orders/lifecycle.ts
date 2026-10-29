import "server-only";
import type { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { canTransition, type OrderStatusName } from "@/lib/orders/status";
import { ledgerKeys } from "@/lib/stars/rules";
import { getSetting } from "@/lib/settings";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { assertPaymentMethodEnabled, PaymentMethodDisabledError } from "@/server/payments/methods";
import { applyStarMoves, getStarBalance, InsufficientStarsError, type StarMove } from "@/server/stars/ledger";

export type LifecycleError =
  | "INVALID_REQUEST"
  | "WRONG_STATE"
  | "PAYMENT_METHOD_DISABLED"
  | "DUPLICATE_TRANSFER"
  | "PAYMENT_NOT_CONFIRMED"
  | "INSUFFICIENT_STARS"
  | "CONFLICT";
export type LifecycleResult = { ok: true } | { ok: false; error: LifecycleError };

class Abort extends Error {
  constructor(readonly error: LifecycleError) {
    super(error);
  }
}

type Tx = Prisma.TransactionClient;
const fail = (error: LifecycleError): never => {
  throw new Abort(error);
};

/** Runs `work` in a transaction. An Abort rolls everything back and becomes a normal error result. */
async function run(work: (tx: Tx) => Promise<void>): Promise<LifecycleResult> {
  try {
    await db.$transaction(work);
    return { ok: true };
  } catch (error) {
    if (error instanceof Abort) return { ok: false, error: error.error };
    if (error instanceof InsufficientStarsError) return { ok: false, error: "INSUFFICIENT_STARS" };
    throw error;
  }
}

type OrderRow = Prisma.OrderGetPayload<{ include: { merchant: true } }>;

async function loadOrder(tx: Tx, orderId: string): Promise<OrderRow> {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { merchant: true } });
  if (!order) throw new NotFoundError();
  return order;
}

/** The customer of the order. Another customer's id looks like a missing order. */
async function loadOwnCustomerOrder(tx: Tx, actor: Actor, orderId: string): Promise<OrderRow> {
  if (actor.role !== "CUSTOMER") throw new AuthorizationError();
  const order = await loadOrder(tx, orderId);
  if (order.customerId !== actor.id) throw new NotFoundError();
  return order;
}

/** The merchant that owns the order's shop, or an admin holding `payments.review` (override). */
async function loadOrderForSeller(tx: Tx, actor: Actor, orderId: string): Promise<{ order: OrderRow; asAdmin: boolean }> {
  const order = await loadOrder(tx, orderId);
  if (actor.role === "MERCHANT" && order.merchant.ownerId === actor.id) return { order, asAdmin: false };
  if (hasPermission(actor, "payments.review")) return { order, asAdmin: true };
  throw new NotFoundError(); // wrong merchant / wrong role: indistinguishable from a missing order
}

/**
 * Change orderStatus with a compare-and-set, so two concurrent requests can never both apply the same transition.
 * Writes the append-only OrderEvent in the same transaction.
 */
async function moveStatus(tx: Tx, order: OrderRow, to: OrderStatus, actorId: string, note: string | null, extra: Prisma.OrderUpdateManyMutationInput = {}): Promise<void> {
  if (!canTransition(order.orderStatus as OrderStatusName, to as OrderStatusName)) fail("WRONG_STATE");
  const changed = await tx.order.updateMany({ where: { id: order.id, orderStatus: order.orderStatus }, data: { orderStatus: to, ...extra } });
  if (changed.count !== 1) fail("CONFLICT");
  await tx.orderEvent.create({ data: { orderId: order.id, field: "orderStatus", fromValue: order.orderStatus, toValue: to, actorId, note } });
}

async function setPaymentStatus(tx: Tx, order: OrderRow, to: PaymentStatus, actorId: string, note: string | null): Promise<void> {
  const changed = await tx.order.updateMany({ where: { id: order.id, paymentStatus: order.paymentStatus }, data: { paymentStatus: to } });
  if (changed.count !== 1) fail("CONFLICT");
  await tx.orderEvent.create({ data: { orderId: order.id, field: "paymentStatus", fromValue: order.paymentStatus, toValue: to, actorId, note } });
}

// ───────────────────────── payment ─────────────────────────

const REFERENCE_PATTERN = /^[A-Za-z0-9\-_/ ]{4,64}$/;
const RECEIPT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_\-.]{5,199}$/;

export interface SubmitPaymentInput {
  method: string;
  referenceNo: string;
  /** Private storage key produced by the upload service (never a URL). */
  receiptKey: string;
}

/**
 * Customer sends the transfer proof. This does NOT confirm payment: it only moves the payment to
 * "awaiting merchant confirmation". The amount is the suborder total decided by the server.
 */
export async function submitPayment(actor: Actor, orderId: string, input: SubmitPaymentInput): Promise<LifecycleResult> {
  const referenceNo = typeof input.referenceNo === "string" ? input.referenceNo.trim() : "";
  if (!REFERENCE_PATTERN.test(referenceNo) || typeof input.receiptKey !== "string" || !RECEIPT_KEY_PATTERN.test(input.receiptKey) || input.receiptKey.includes("..")) {
    return { ok: false, error: "INVALID_REQUEST" };
  }
  try {
    await assertPaymentMethodEnabled(String(input.method));
  } catch (error) {
    if (error instanceof PaymentMethodDisabledError) return { ok: false, error: "PAYMENT_METHOD_DISABLED" };
    throw error;
  }
  return run(async (tx) => {
    const order = await loadOwnCustomerOrder(tx, actor, orderId);
    if (order.orderStatus !== "AWAITING_PAYMENT" || (order.paymentStatus !== "NOT_REQUIRED_YET" && order.paymentStatus !== "REJECTED")) fail("WRONG_STATE");

    // Same transfer reference already used for another order on this method: keep it, but flag it for the reviewer.
    const clash = await tx.payment.findFirst({ where: { method: input.method, referenceNo, orderId: { not: order.id }, rejectedReason: null } });
    await tx.payment.create({
      data: {
        orderId: order.id,
        method: input.method,
        receiptKey: input.receiptKey,
        referenceNo,
        amountCents: order.totalCents,
        flagged: clash !== null,
        flagReason: clash ? "Transfer reference already used on another order" : null,
      },
    });
    await setPaymentStatus(tx, order, "AWAITING_MERCHANT_CONFIRMATION", actor.id, "receipt submitted");
    await writeAudit({ actorId: actor.id, action: "PAYMENT_SUBMITTED", entityType: "Order", entityId: order.id, after: { method: input.method, flagged: clash !== null } }, tx);
  });
}

async function latestOpenPayment(tx: Tx, orderId: string) {
  const payment = await tx.payment.findFirst({ where: { orderId, confirmedAt: null, rejectedReason: null }, orderBy: { submittedAt: "desc" } });
  if (!payment) fail("WRONG_STATE");
  return payment!;
}

/** The shop owner (or an authorized admin) confirms the money really arrived. Only then can the merchant approve the order. */
export async function confirmPayment(actor: Actor, orderId: string): Promise<LifecycleResult> {
  return run(async (tx) => {
    const { order, asAdmin } = await loadOrderForSeller(tx, actor, orderId);
    if (order.orderStatus !== "AWAITING_PAYMENT" || order.paymentStatus !== "AWAITING_MERCHANT_CONFIRMATION") fail("WRONG_STATE");
    const payment = await latestOpenPayment(tx, order.id);

    // The same transfer can never be confirmed twice, across orders.
    const alreadyConfirmed = await tx.payment.findFirst({
      where: { method: payment.method, referenceNo: payment.referenceNo, confirmedAt: { not: null }, id: { not: payment.id } },
    });
    if (alreadyConfirmed) {
      await tx.payment.update({ where: { id: payment.id }, data: { flagged: true, flagReason: "Transfer reference already confirmed on another order" } });
      fail("DUPLICATE_TRANSFER");
    }

    const done = await tx.payment.updateMany({ where: { id: payment.id, confirmedAt: null }, data: { confirmedAt: new Date(), confirmedById: actor.id } });
    if (done.count !== 1) fail("CONFLICT");
    await setPaymentStatus(tx, order, "CONFIRMED", actor.id, asAdmin ? "admin override" : "confirmed by merchant");
    await moveStatus(tx, { ...order, paymentStatus: "CONFIRMED" }, "AWAITING_MERCHANT_APPROVAL", actor.id, null);
    await writeAudit({ actorId: actor.id, action: "PAYMENT_CONFIRMED", entityType: "Order", entityId: order.id, after: { paymentId: payment.id, asAdmin } }, tx);
  });
}

/** Rejecting a transfer leaves the order waiting for payment so the customer can send a new proof. */
export async function rejectPayment(actor: Actor, orderId: string, reason: string): Promise<LifecycleResult> {
  const clean = typeof reason === "string" ? reason.trim() : "";
  if (clean.length < 3 || clean.length > 300) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const { order, asAdmin } = await loadOrderForSeller(tx, actor, orderId);
    if (order.orderStatus !== "AWAITING_PAYMENT" || order.paymentStatus !== "AWAITING_MERCHANT_CONFIRMATION") fail("WRONG_STATE");
    const payment = await latestOpenPayment(tx, order.id);
    await tx.payment.update({ where: { id: payment.id }, data: { rejectedReason: clean } });
    await setPaymentStatus(tx, order, "REJECTED", actor.id, clean);
    await writeAudit({ actorId: actor.id, action: "PAYMENT_REJECTED", entityType: "Order", entityId: order.id, after: { paymentId: payment.id, reason: clean, asAdmin } }, tx);
  });
}

// ───────────────────────── stars + refunds helpers ─────────────────────────

async function chargeStars(tx: Tx, order: OrderRow, actorId: string): Promise<void> {
  const perParty = await getSetting("orders.stars_charge_per_party");
  if (perParty === 0) return;
  const minCustomer = await getSetting("stars.min_balance_customer");
  const minMerchant = await getSetting("stars.min_balance_merchant");
  if ((await getStarBalance(tx, order.customerId)) < Math.max(minCustomer, perParty)) fail("INSUFFICIENT_STARS");
  if ((await getStarBalance(tx, order.merchant.ownerId)) < Math.max(minMerchant, perParty)) fail("INSUFFICIENT_STARS");
  const moves: StarMove[] = [
    { userId: order.customerId, amount: -perParty, reason: "ORDER_CHARGE", orderId: order.id, actorId, idempotencyKey: ledgerKeys.orderCharge(order.customerId, order.id) },
    { userId: order.merchant.ownerId, amount: -perParty, reason: "ORDER_CHARGE", orderId: order.id, actorId, idempotencyKey: ledgerKeys.orderCharge(order.merchant.ownerId, order.id) },
  ];
  await applyStarMoves(tx, moves);
}

/** Gives back exactly what the ledger charged for this order (not the current setting), once per party. */
async function refundStars(tx: Tx, order: OrderRow, actorId: string): Promise<void> {
  const charges = await tx.starLedgerEntry.findMany({ where: { orderId: order.id, reason: "ORDER_CHARGE" }, include: { account: true } });
  const moves: StarMove[] = charges.map((c) => ({
    userId: c.account.userId,
    amount: -c.amount,
    reason: "ORDER_REFUND",
    orderId: order.id,
    actorId,
    idempotencyKey: ledgerKeys.orderRefund(c.account.userId, order.id),
  }));
  if (moves.length > 0) await applyStarMoves(tx, moves);
}

/** If the customer's transfer was already confirmed, the merchant owes it back: open a Refund with a server-set deadline. */
async function openRefundIfPaid(tx: Tx, order: OrderRow, actorId: string): Promise<void> {
  if (order.paymentStatus !== "CONFIRMED") return;
  const payment = await tx.payment.findFirst({ where: { orderId: order.id, confirmedAt: { not: null } }, orderBy: { confirmedAt: "desc" } });
  if (!payment) return;
  const hours = await getSetting("refunds.deadline_hours");
  await tx.refund.create({ data: { orderId: order.id, amountCents: payment.amountCents, dueAt: new Date(Date.now() + hours * 3_600_000) } });
  const changed = await tx.order.updateMany({ where: { id: order.id, refundStatus: "NONE" }, data: { refundStatus: "PENDING" } });
  if (changed.count !== 1) fail("CONFLICT");
  await tx.orderEvent.create({ data: { orderId: order.id, field: "refundStatus", fromValue: "NONE", toValue: "PENDING", actorId, note: "refund opened" } });
}

// ───────────────────────── merchant decision and fulfilment ─────────────────────────

/** Approve: charges the stars (once) and moves on. Reject: only before approval, opens a refund if money was confirmed. */
export async function decideOrder(actor: Actor, orderId: string, decision: "APPROVE" | "REJECT", reason?: string): Promise<LifecycleResult> {
  const clean = reason?.trim() ?? "";
  if (decision === "REJECT" && (clean.length < 3 || clean.length > 300)) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const { order } = await loadOrderForSeller(tx, actor, orderId);
    if (actor.role !== "MERCHANT") throw new AuthorizationError(); // approving is the shop owner's decision, not an admin override
    if (order.orderStatus !== "AWAITING_MERCHANT_APPROVAL") fail("WRONG_STATE");
    if (order.paymentStatus !== "CONFIRMED") fail("PAYMENT_NOT_CONFIRMED");

    if (decision === "APPROVE") {
      await chargeStars(tx, order, actor.id);
      await moveStatus(tx, order, "APPROVED", actor.id, null, { starsChargedAt: new Date(), approvedAt: new Date(), approvedById: actor.id });
      await writeAudit({ actorId: actor.id, action: "ORDER_APPROVED", entityType: "Order", entityId: order.id }, tx);
    } else {
      await moveStatus(tx, order, "REJECTED", actor.id, clean, { cancelledAt: new Date(), cancelledById: actor.id, cancelReason: clean });
      await openRefundIfPaid(tx, order, actor.id);
      await writeAudit({ actorId: actor.id, action: "ORDER_REJECTED", entityType: "Order", entityId: order.id, after: { reason: clean } }, tx);
    }
  });
}

const FULFILMENT_STEPS: Record<string, OrderStatus> = { PREPARING: "PREPARING", READY: "READY", OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY", DELIVERED: "DELIVERED" };

/** The shop owner moves an approved order forward. (Driver-driven delivery steps arrive with the delivery phase.) */
export async function advanceOrder(actor: Actor, orderId: string, to: "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED"): Promise<LifecycleResult> {
  const target = FULFILMENT_STEPS[to];
  if (!target) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (actor.role !== "MERCHANT" || order.merchant.ownerId !== actor.id) throw new NotFoundError();
    await moveStatus(tx, order, target, actor.id, null);
    await writeAudit({ actorId: actor.id, action: "ORDER_ADVANCED", entityType: "Order", entityId: order.id, after: { to } }, tx);
  });
}

/**
 * Cancellation.
 * - Before approval: the customer, the shop owner, or an authorized admin may cancel; no stars were charged.
 * - After approval (APPROVED only): the shop owner or an authorized admin may cancel; the stars charged for THIS suborder
 *   go back to both sides exactly once. Later stages need the cancellation-request flow (not built yet).
 * If the transfer was already confirmed, a Refund is opened (the merchant returns the money; nothing is paid out automatically).
 */
export async function cancelOrder(actor: Actor, orderId: string, reason: string): Promise<LifecycleResult> {
  const clean = typeof reason === "string" ? reason.trim() : "";
  if (clean.length < 3 || clean.length > 300) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const order = await loadOrder(tx, orderId);
    const isCustomer = actor.role === "CUSTOMER" && order.customerId === actor.id;
    const isSeller = actor.role === "MERCHANT" && order.merchant.ownerId === actor.id;
    const isAdmin = hasPermission(actor, "payments.review");
    if (!isCustomer && !isSeller && !isAdmin) throw new NotFoundError();
    const approved = order.orderStatus === "APPROVED";
    if (approved && isCustomer) fail("WRONG_STATE"); // the customer cannot cancel after the merchant accepted

    await moveStatus(tx, order, "CANCELLED", actor.id, clean, { cancelledAt: new Date(), cancelledById: actor.id, cancelReason: clean });
    if (approved) {
      await refundStars(tx, order, actor.id);
      await tx.order.update({ where: { id: order.id }, data: { starsRefundedAt: new Date() } });
    }
    await openRefundIfPaid(tx, order, actor.id);
    await writeAudit({ actorId: actor.id, action: "ORDER_CANCELLED", entityType: "Order", entityId: order.id, after: { reason: clean, starsRefunded: approved } }, tx);
  });
}
