import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";

export class PaymentMethodDisabledError extends Error {
  constructor(
    code: string,
    readonly reason: "DISABLED" | "NO_RECEIVER" = "DISABLED",
  ) {
    super(`Payment method "${code}" is not available (${reason})`);
    this.name = "PaymentMethodDisabledError";
  }
}

export const RECEIVER_PATTERN = /^[0-9+]{8,20}$/;

/** What the customer may choose: enabled AND with a receiving number set by an admin. */
export async function getEnabledPaymentMethods() {
  return db.paymentMethodConfig.findMany({
    where: { isEnabled: true, receiverNumber: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { code: true, nameAr: true, receiverNumber: true },
  });
}

/** Server-side gate: a disabled method is rejected even if a client sends it directly. */
export async function assertPaymentMethodEnabled(code: string): Promise<void> {
  const method = await db.paymentMethodConfig.findUnique({ where: { code } });
  if (!method?.isEnabled) throw new PaymentMethodDisabledError(code);
  if (!method.receiverNumber) throw new PaymentMethodDisabledError(code, "NO_RECEIVER");
}

/** Sets (or clears with null) the number customers pay to. Validated, audited with before/after. */
export async function setPaymentReceiver(actor: Actor, code: string, receiverNumber: string | null): Promise<{ ok: true } | { ok: false; error: "INVALID_REQUEST" }> {
  if (!hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  const value = receiverNumber === null ? null : receiverNumber.replace(/[\s-]/g, "");
  if (value !== null && !RECEIVER_PATTERN.test(value)) return { ok: false, error: "INVALID_REQUEST" };
  await db.$transaction(async (tx) => {
    const method = await tx.paymentMethodConfig.findUnique({ where: { code } });
    if (!method) throw new NotFoundError();
    if (method.receiverNumber === value) return;
    await tx.paymentMethodConfig.update({ where: { code }, data: { receiverNumber: value } });
    await writeAudit(
      { actorId: actor.id, action: "PAYMENT_RECEIVER_CHANGED", entityType: "PaymentMethodConfig", entityId: code, before: { receiverNumber: method.receiverNumber }, after: { receiverNumber: value } },
      tx,
    );
  });
  return { ok: true };
}

export async function listPaymentMethods(actor: Actor) {
  if (!hasPermission(actor, "settings.view") && !hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  return db.paymentMethodConfig.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function setPaymentMethodEnabled(actor: Actor, code: string, enabled: boolean): Promise<void> {
  if (!hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  await db.$transaction(async (tx) => {
    const method = await tx.paymentMethodConfig.findUnique({ where: { code } });
    if (!method) throw new NotFoundError();
    if (method.isEnabled === enabled) return;
    await tx.paymentMethodConfig.update({ where: { code }, data: { isEnabled: enabled } });
    await writeAudit(
      {
        actorId: actor.id,
        action: "PAYMENT_METHOD_TOGGLED",
        entityType: "PaymentMethodConfig",
        entityId: code,
        before: { isEnabled: method.isEnabled },
        after: { isEnabled: enabled },
      },
      tx,
    );
  });
}
