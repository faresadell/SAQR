import type { RoleName } from "@/lib/auth/permissions";

/** Where each role lands. Navigation only: access is enforced by the server guards, never by this map. */
export const ROLE_HOME: Record<RoleName, string> = {
  CUSTOMER: "/account",
  MERCHANT: "/merchant",
  DRIVER: "/driver",
  ADMIN: "/admin",
};

export const ROLE_LABEL: Record<RoleName, string> = {
  CUSTOMER: "عميل",
  MERCHANT: "تاجر",
  DRIVER: "سائق",
  ADMIN: "مشرف",
};
