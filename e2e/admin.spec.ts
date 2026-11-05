import { expect, test } from "@playwright/test";
import { totpAt } from "../src/lib/auth/totp";
import { E2E_ACCOUNTS, E2E_ADMIN_PW, E2E_TOTP_SECRET, type E2eProject } from "./accounts";
import { expectNoHorizontalScroll, skipIntro, TINY_PNG, watchErrors } from "./helpers";

test("admin: sign in with the authenticator code, open every page, add a shop with an owner and a picture, publish an offer for it", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  await skipIntro(page);
  const errors = watchErrors(page);
  const project = testInfo.project.name as E2eProject;
  const acc = E2E_ACCOUNTS[project];
  const shopName = `مطعم أضافه الأدمن ${project}`;

  await page.goto("/login");
  await page.locator("input[name=phone]").fill(acc.adminPhone.replace("+20", "0"));
  await page.locator("input[name=password]").fill(E2E_ADMIN_PW);
  await page.getByText("دخول المشرفين").click();
  await page.locator("input[name=totp]").fill(totpAt(E2E_TOTP_SECRET, Math.floor(Date.now() / 1000 / 30)));
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/\/admin/);

  const pages = ["/admin", "/admin/merchants", "/admin/businesses", "/admin/products", "/admin/catalog", "/admin/offers", "/admin/orders", "/admin/payments", "/admin/packages", "/admin/users", "/admin/settings", "/admin/audit", "/admin/legal", "/admin/notifications", "/admin/complaints", "/admin/contest", "/admin/security", "/admin/shops/new"];
  for (const path of pages) {
    const r = await page.goto(path);
    expect(r?.status(), path).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  }

  // Add a shop and choose its owner from the list.
  await page.goto("/admin/shops/new");
  const ownerValue = await page.locator("select[name=ownerId] option", { hasText: `صاحب ${project}` }).getAttribute("value");
  await page.locator("select[name=ownerId]").selectOption(ownerValue ?? "");
  await page.locator("input[name=name]").fill(shopName);
  await page.locator("select[name=businessType]").selectOption("restaurant");
  await page.locator("textarea[name=description]").fill("أكل بيتي");
  await page.locator("input[name=address]").fill("شارع النيل");
  await page.locator("input[name=phone]").fill("01012345678");
  await page.locator("textarea[name=phones]").fill("0223456789");
  await page.locator("input[name=facebook]").fill("https://www.facebook.com/e2e-shop");
  await page.getByRole("button", { name: "إضافة النشاط" }).click();
  await expect(page).toHaveURL(/\/admin\/shops\/[^/]+\?created=1/);
  const shopId = page.url().match(/\/admin\/shops\/([^/?]+)/)![1]!;

  await page.locator("input[type=file]").setInputFiles({ name: "shop.png", mimeType: "image/png", buffer: TINY_PNG });
  await expect(page.getByText("تم رفع الصورة")).toBeVisible();
  expect((await page.request.get(`/api/v1/shops/${shopId}/image`)).status()).toBe(200);

  // Edit it.
  await page.locator("input[name=address]").fill("شارع الجمهورية");
  await page.getByRole("button", { name: "حفظ التعديلات" }).click();
  await expect(page.getByText("تم حفظ بيانات النشاط")).toBeVisible();

  // The customer side sees it, with its contacts.
  await page.goto("/explore?type=restaurant");
  await expect(page.getByRole("link", { name: new RegExp(shopName) })).toBeVisible();
  await page.goto(`/shops/${shopId}`);
  await expect(page.getByRole("heading", { name: shopName })).toBeVisible();
  await expect(page.locator('a[href="tel:0223456789"]')).toBeVisible();
  await expect(page.locator('a[href^="https://www.facebook.com/"]')).toBeVisible();
  await expect(page.getByText("شارع الجمهورية")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Offer on behalf of the shop.
  await page.goto(`/admin/offers?shop=${shopId}`);
  await page.locator("input[name=title]").fill(`عرض الأدمن ${project}`);
  await page.getByRole("button", { name: "نشر العرض نيابةً عن النشاط" }).click();
  await expect(page.getByText("تم نشر العرض نيابةً عن النشاط")).toBeVisible();
  await page.goto("/offers");
  await expect(page.getByText(`عرض الأدمن ${project}`)).toBeVisible();
  errors.assertClean();
});
