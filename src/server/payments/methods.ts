import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";

export class PaymentMethodDisabledError extends Error {
  constructor(code: string) {
    super(`Payment method "${code}" is not enabled`);
    this.name = "PaymentMethodDisabledError";
  }
}

/** What the customer may choose at checkout. Checkout (phase 6) must read this on the server. */
export async function getEnabledPaymentMethods() {
  return db.paymentMethodConfig.findMany({ where: { isEnabled: true }, orderBy: { sortOrder: "asc" } });
}

/** Server-side gate: a disabled method is rejected even if a client sends it directly. */
export async function assertPaymentMethodEnabled(code: string): Promise<void> {
  const method = await db.paymentMethodConfig.findUnique({ where: { code } });
  if (!method?.isEnabled) throw new PaymentMethodDisabledError(code);
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
