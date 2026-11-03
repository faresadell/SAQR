/** Test accounts that exist only in the throwaway CI database. */
export const E2E_PROJECTS = ["desktop", "mobile"] as const;
export type E2eProject = (typeof E2E_PROJECTS)[number];

/** Random per CI run (the workflow generates them); never written in the repository. */
export const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
export const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";
export const E2E_TOTP_SECRET = Buffer.from(process.env.E2E_TOTP_SECRET ?? "", "base64");

export const E2E_ACCOUNTS: Record<E2eProject, { adminPhone: string; ownerPhone: string; seededShopPhone: string; seededShopName: string }> = {
  desktop: { adminPhone: "+201000000001", ownerPhone: "+201000000002", seededShopPhone: "+201000000003", seededShopName: "مطعم الاختبار المكتبي" },
  mobile: { adminPhone: "+201000000011", ownerPhone: "+201000000012", seededShopPhone: "+201000000013", seededShopName: "مطعم الاختبار الموبايل" },
};
