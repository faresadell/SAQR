import "server-only";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { listPlansFor, getMyPlanState } from "@/server/plans/service";
import { listMyNotifications } from "@/server/notifications/service";
import { getEnabledPaymentMethods } from "@/server/payments/methods";
import { listOrdersForActor, getOrderForActor } from "@/server/orders/read";
import type { OrderStatus } from "./status";
import type { CurrentPackage, MainOrderView, NotificationItem, PackageOption, PaymentInstruction, StarsOverview, SubOrderView } from "./types";

/**
 * The only place that translates existing backend services into the UI view models. Read-only: every function
 * delegates to a permission-checked service or filters by the signed-in user's id. Nothing here writes.
 */

const STAR_REASON_LABEL: Record<string, string> = {
  PURCHASE: "شراء باقة",
  PLAN_GRANT: "نجوم باقة",
  ORDER_CHARGE: "خصم طلب",
  ORDER_REFUND: "استرداد نجوم طلب",
  DAILY_CHARGE: "خصم يومي",
  MONTHLY_REWARD: "مكافأة شهرية",
  ADMIN_CORRECTION: "تصحيح إداري",
};

export async function mapStars(actor: Actor): Promise<StarsOverview> {
  const account = await db.starAccount.findUnique({ where: { userId: actor.id }, select: { id: true, balance: true } });
  if (!account) return { balance: 0, ledger: [] };
  const rows = await db.starLedgerEntry.findMany({
    where: { accountId: account.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: { id: true, createdAt: true, reason: true, amount: true, balanceAfter: true, orderId: true },
  });
  return {
    balance: account.balance,
    ledger: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      reason: STAR_REASON_LABEL[r.reason] ?? r.reason,
      amount: r.amount,
      balanceAfter: r.balanceAfter,
      ...(r.orderId ? { reference: r.orderId } : {}),
    })),
  };
}

export async function mapPackages(actor: Actor): Promise<{ options: PackageOption[]; current: CurrentPackage; instructions: PaymentInstruction[] }> {
  const [plans, state, methods] = await Promise.all([listPlansFor(actor), getMyPlanState(actor), getEnabledPaymentMethods()]);
  const options: PackageOption[] = plans.map((p) => ({
    id: p.code,
    name: p.nameAr,
    priceCents: p.priceCents,
    baseStars: p.baseStars,
    bonusStars: p.bonusStars,
    ...(p.offerQuota !== null ? { offerQuota: p.offerQuota } : {}),
  }));

  let current: CurrentPackage = { state: "NONE" };
  const sub = state.subscription;
  const latest = state.purchases[0];
  if (sub?.isActive) {
    current = {
      state: "ACTIVE",
      packageName: sub.plan.nameAr,
      activatedAt: sub.startsAt.toISOString(),
      expiresAt: sub.expiresAt.toISOString(),
      daysLeft: Math.max(0, Math.ceil((sub.expiresAt.getTime() - Date.now()) / 86_400_000)),
    };
  } else if (latest?.status === "PENDING") {
    current = { state: "PENDING_REVIEW", packageName: latest.plan.nameAr };
  } else if (sub) {
    current = { state: "EXPIRED", packageName: sub.plan.nameAr, expiresAt: sub.expiresAt.toISOString() };
  } else if (latest?.status === "REJECTED") {
    current = { state: "REJECTED", packageName: latest.plan.nameAr };
  }

  // Only methods an admin enabled AND gave a receiving number are returned; the number comes from the admin setting, never invented.
  const instructions: PaymentInstruction[] = methods.map((m) => ({
    methodCode: m.code,
    methodLabel: m.nameAr,
    accountLabel: "رقم التحويل",
    ...(m.receiverNumber ? { accountValue: m.receiverNumber } : {}),
  }));
  return { options, current, instructions };
}

export async function mapNotifications(actor: Actor): Promise<NotificationItem[]> {
  const page = await listMyNotifications(actor, { limit: 30 });
  return page.items.map((n) => ({ id: n.id, title: n.title, body: n.body, createdAt: n.createdAt.toISOString(), read: n.readAt !== null }));
}

const FLOW: { status: OrderStatus; label: string }[] = [
  { status: "AWAITING_PAYMENT", label: "بانتظار الدفع" },
  { status: "AWAITING_MERCHANT_APPROVAL", label: "بانتظار موافقة النشاط" },
  { status: "APPROVED", label: "تمت الموافقة" },
  { status: "PREPARING", label: "قيد التجهيز" },
  { status: "READY", label: "جاهز" },
  { status: "OUT_FOR_DELIVERY", label: "في الطريق" },
  { status: "DELIVERED", label: "تم التسليم" },
];

function timeline(status: OrderStatus): SubOrderView["events"] {
  if (status === "CANCELLED" || status === "REJECTED" || status === "CANCELLATION_REQUESTED") {
    return [{ key: status, label: status === "REJECTED" ? "مرفوض" : status === "CANCELLED" ? "ملغي" : "طلب إلغاء", state: status === "CANCELLATION_REQUESTED" ? "current" : "failed" }];
  }
  const index = FLOW.findIndex((s) => s.status === status);
  return FLOW.map((s, i) => ({ key: s.status, label: s.label, state: i < index ? "done" : i === index ? (status === "DELIVERED" ? "done" : "current") : "upcoming" }));
}

type OrderRow = Awaited<ReturnType<typeof getOrderForActor>>;

function addressLine(snap: unknown): string {
  const line = (snap as { line?: unknown } | null)?.line;
  return typeof line === "string" ? line : "";
}

async function merchantNames(ids: string[]): Promise<Map<string, string>> {
  const rows = await db.merchant.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  return new Map(rows.map((m) => [m.id, m.name]));
}

function toSub(o: OrderRow, names: Map<string, string>): SubOrderView {
  const pay = o.payments[0];
  return {
    id: o.id,
    number: o.number,
    merchantName: names.get(o.merchantId) ?? "نشاط",
    items: o.items.map((i) => ({ id: i.productId ?? `${o.id}:${i.nameSnapshot}`, name: i.nameSnapshot, quantity: i.quantity, unitPriceCents: i.unitPriceCents, lineTotalCents: i.lineTotalCents })),
    subtotalCents: o.subtotalCents,
    orderStatus: o.orderStatus,
    paymentStatus: o.paymentStatus,
    deliveryStatus: o.deliveryStatus,
    refundStatus: o.refundStatus,
    ...(pay ? { payment: { methodLabel: pay.method, ...(pay.referenceNo ? { referenceNo: pay.referenceNo } : {}), submittedAt: pay.submittedAt.toISOString(), amountCents: pay.amountCents } } : {}),
    events: timeline(o.orderStatus),
  };
}

/** Groups a customer's suborders by checkout (parent order). Suborders without a parent show as their own group. */
export async function mapCustomerOrders(actor: Actor, limit = 30): Promise<MainOrderView[]> {
  const page = await listOrdersForActor(actor, { limit });
  const names = await merchantNames(page.items.map((o) => o.merchantId));
  const groups = new Map<string, OrderRow[]>();
  for (const o of page.items) groups.set(o.parentOrderId ?? o.id, [...(groups.get(o.parentOrderId ?? o.id) ?? []), o]);
  return [...groups.entries()].map(([id, subs]) => {
    const first = subs[0]!;
    return {
      id,
      number: Math.min(...subs.map((s) => s.number)),
      createdAt: first.createdAt.toISOString(),
      deliveryFeeCents: subs.reduce((n, s) => n + s.deliveryFeeCents, 0),
      totalCents: subs.reduce((n, s) => n + s.totalCents, 0),
      addressLine: addressLine(first.addressSnap),
      subOrders: subs.map((s) => toSub(s, names)),
    };
  });
}

export async function mapCustomerOrder(actor: Actor, id: string): Promise<MainOrderView | null> {
  const all = await mapCustomerOrders(actor, 50);
  return all.find((g) => g.id === id) ?? null;
}

export { merchantNames, toSub, listOrdersForActor };
