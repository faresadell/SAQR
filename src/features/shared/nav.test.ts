import { describe, expect, it } from "vitest";
import { adminNav, customerNav, filterNav } from "./nav";

describe("filterNav", () => {
  it("hides admin items the user has no permission for", () => {
    const { groups } = adminNav();
    const visible = filterNav(groups, (p) => p === "users.view").flatMap((g) => g.items.map((i) => i.href));
    expect(visible).toContain("/admin");
    expect(visible).toContain("/admin/users");
    expect(visible).not.toContain("/admin/audit");
    expect(visible).not.toContain("/admin/payments");
  });

  it("keeps every item when all permissions are held", () => {
    const { groups } = adminNav();
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    const kept = filterNav(groups, () => true).reduce((n, g) => n + g.items.length, 0);
    expect(kept).toBe(total);
  });
});

describe("nav base path", () => {
  it("prefixes every link so the preview can reuse the same menu", () => {
    const { groups } = customerNav("/preview/account");
    for (const item of groups.flatMap((g) => g.items)) expect(item.href.startsWith("/preview/account")).toBe(true);
  });
});
