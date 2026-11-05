import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, type E2eProject } from "./accounts";
import { expectNoHorizontalScroll, skipIntro, watchErrors } from "./helpers";

const PUBLIC_PAGES = ["/", "/explore", "/offers", "/tasbeeh", "/settings", "/search", "/login", "/register", "/forgot-password", "/privacy", "/legal/terms", "/legal/cancellation", "/legal/refund", "/legal/support"];

test("opening screen shows once and can be skipped", async ({ page }) => {
  await page.goto("/");
  const intro = page.getByRole("dialog", { name: "مرحباً بك في صقر" });
  await expect(intro).toBeVisible();
  await page.getByRole("button", { name: "تخطي" }).click();
  await expect(intro).toBeHidden();
  await page.reload();
  await expect(intro).toBeHidden(); // already seen in this session
});

for (const path of PUBLIC_PAGES) {
  test(`public page ${path}: loads, no errors, fits the screen`, async ({ page }) => {
    await skipIntro(page);
    const errors = watchErrors(page);
    const response = await page.goto(path);
    expect(response?.status(), `${path} status`).toBeLessThan(400);
    await expect(page.locator("main, h1").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    errors.assertClean();
  });
}

test("privacy policy: full draft text, readable sections, still labelled as an unapproved draft", async ({ page }) => {
  await skipIntro(page);
  await page.goto("/legal/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "سياسة الخصوصية" })).toBeVisible();
  await expect(page.getByText("مسودة غير معتمدة")).toBeVisible();
  for (const section of ["البيانات التي نجمعها", "حقوقك", "مدة الاحتفاظ"]) await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("settings: grouped rows with working links", async ({ page }) => {
  await skipIntro(page);
  await page.goto("/settings");
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: "سياسة الخصوصية" })).toBeVisible();
  await expect(main.getByRole("switch")).toBeVisible();
  await main.getByRole("link", { name: "الدعم" }).click();
  await expect(page).toHaveURL(/\/legal\/support/);
});

test("first-admin setup page does not exist unless it was switched on", async ({ page }) => {
  await page.goto("/setup");
  // the page streams, so judge by content: no setup form is ever rendered unless SETUP_TOKEN is set
  await expect(page.getByRole("heading", { name: "إنشاء المدير الأول" })).toHaveCount(0);
  await expect(page.locator("input[name=token]")).toHaveCount(0);
});

test("bottom bar: five sections on a phone, hidden on desktop", async ({ page }, testInfo) => {
  await skipIntro(page);
  await page.goto("/");
  const bar = page.getByRole("navigation", { name: "التنقل السريع" });
  if (testInfo.project.name === "mobile") {
    await expect(bar).toBeVisible();
    for (const label of ["الرئيسية", "المنتجات", "العروض", "التسبيح", "الإعدادات"]) await expect(bar.getByRole("link", { name: label })).toBeVisible();
    await bar.getByRole("link", { name: "المنتجات" }).click();
    await expect(page).toHaveURL(/\/explore/);
  } else {
    await expect(bar).toBeHidden();
  }
});

test("customer browsing: category tile -> shop -> product -> cart", async ({ page }, testInfo) => {
  await skipIntro(page);
  const errors = watchErrors(page);
  const shopName = E2E_ACCOUNTS[testInfo.project.name as E2eProject].seededShopName;
  await page.goto("/explore");
  await expect(page.getByRole("navigation", { name: "الأقسام" })).toBeVisible();
  await page.getByRole("navigation", { name: "الأقسام" }).getByRole("link", { name: "مطاعم" }).click();
  await expect(page).toHaveURL(/type=restaurant/);
  await page.getByRole("link", { name: new RegExp(shopName) }).click();
  await expect(page.getByRole("heading", { name: shopName })).toBeVisible();
  await expect(page.getByText("كباب")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "أضف كباب إلى السلة" }).click();
  await page.goto("/cart");
  await expect(page.getByText("كباب")).toBeVisible();
  await expectNoHorizontalScroll(page);
  errors.assertClean();
});
