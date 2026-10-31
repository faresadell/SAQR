export const PERMISSIONS = [
  "users.view",
  "users.manage",
  "settings.view",
  "settings.manage",
  "merchants.review",
  "catalog.manage",
  "orders.view",
  "payments.review",
  "refunds.verify",
  "settlements.manage",
  "offers.manage",
  "contest.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type RoleName = "CUSTOMER" | "MERCHANT" | "DRIVER" | "ADMIN";

export interface Principal {
  role: RoleName;
  isSuperAdmin: boolean;
  permissions: readonly string[];
}

/** The signed-in person performing an action (services take this, never a raw request). */
export interface Actor extends Principal {
  id: string;
}

/** Only admins can hold permissions. The main administrator holds all of them. */
export function hasPermission(principal: Principal, permission: Permission): boolean {
  if (principal.role !== "ADMIN") return false;
  if (principal.isSuperAdmin) return true;
  return principal.permissions.includes(permission);
}
