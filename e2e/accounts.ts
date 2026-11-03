/** Fixed test accounts. They exist only in the throwaway CI database; nothing here is a real credential. */
export const E2E_PROJECTS = ["desktop", "mobile"] as const;
export type E2eProject = (typeof E2E_PROJECTS)[number];

export const E2E_ADMIN_PASSWORD = "E2e-Admin-Pass-2026!";
export const E2E_TOTP_SECRET = Buffer.from("e2e-fixed-secret-20b");

export const E2E_ACCOUNTS: Record<E2eProject, { adminPhone: string; ownerPhone: string; seededShopPhone: string; seededShopName: string }> = {
  desktop: { adminPhone: "+201000000001", ownerPhone: "+201000000002", seededShopPhone: "+201000000003", seededShopName: "مطعم الاختبار المكتبي" },
  mobile: { adminPhone: "+201000000011", ownerPhone: "+201000000012", seededShopPhone: "+201000000013", seededShopName: "مطعم الاختبار الموبايل" },
};
