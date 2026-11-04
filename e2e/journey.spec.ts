import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { totpAt } from "../src/lib/auth/totp";
import { E2E_ACCOUNTS, E2E_ADMIN_PW, E2E_TOTP_SECRET, type E2eProject } from "./accounts";
import { expectNoHorizontalScroll, login, signUp, skipIntro, TINY_PNG, uniqueDigits, watchErrors } from "./helpers";

/** A separate signed-in browser session (one per person), with the same screen size as the project under test. */
async function person(browser: Browser, project: { use: Record<string, unknown> }): Promise<{ context: BrowserContext; page: Page }> {
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL, locale } = project.use as Record<string, never>;
  const context = await browser.newContext({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL, locale });
  const page = await context.newPage();
  await skipIntro(page);
  return { context, page };
}

/** Customer or shop buys a star package: pick a package, give a transfer reference, attach a receipt. The admin approves it later. */
async function requestPackage(page: Page, path: string, reference: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("button", { name: "إرسال للمراجعة" })).toBeEnabled();
  await page.locator("input[name=referenceNo]").fill(reference);
  await page.locator("input[type=file][name=receipt]").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: TINY_PNG });
  await page.getByRole("button", { name: "إرسال للمراجعة" }).click();
  await expect(page.getByText("قيد المراجعة").first()).toBeVisible();
}

test("a full order: stars bought, order placed and paid, shop accepts and prepares, driver takes and delivers", async ({ browser }, testInfo) => {
  test.setTimeout(900_000);
  const project = testInfo.project.name as E2eProject;
  const acc = E2E_ACCOUNTS[project];
  const tag = `${project}${uniqueDigits()}`;
  const customer = await person(browser, testInfo.project);
  const shop = await person(browser, testInfo.project);
  const admin = await person(browser, testInfo.project);
  const driver = await person(browser, testInfo.project);
  const errors = watchErrors(customer.page);

  // Customer signs up and saves an address; customer and shop each ask for a star package.
  await signUp(customer.page, "CUSTOMER", `010${uniqueDigits()}`, `buyer-${tag}@example.com`);
  await expect(customer.page).toHaveURL(/\/account/);
  await customer.page.goto("/account/addresses");
  await customer.page.locator("input[name=line]").fill("شارع 9 المعادي عمارة 5");
  await customer.page.getByRole("button", { name: "حفظ العنوان" }).click();
  await expect(customer.page.getByText("شارع 9 المعادي عمارة 5").first()).toBeVisible();
  await requestPackage(customer.page, "/account/packages", `C-${tag}`);

  await login(shop.page, acc.seededShopPhone.replace("+20", "0"), E2E_ADMIN_PW);
  await expect(shop.page).toHaveURL(/\/merchant/);
  await requestPackage(shop.page, "/merchant/packages", `M-${tag}`);

  // The admin approves both transfers.
  await login(admin.page, acc.adminPhone.replace("+20", "0"), E2E_ADMIN_PW, totpAt(E2E_TOTP_SECRET, Math.floor(Date.now() / 1000 / 30) + 1));
  await expect(admin.page).toHaveURL(/\/admin/);
  await admin.page.goto("/admin/payments");
  for (let i = 0; i < 2; i += 1) {
    const approve = admin.page.getByRole("button", { name: "اعتماد الدفع" }).first();
    await expect(approve).toBeVisible();
    await approve.click();
    await expect(admin.page.getByRole("button", { name: "اعتماد الدفع" })).toHaveCount(1 - i, { timeout: 20_000 }).catch(async (error: unknown) => {
      throw new Error(`approval ${i + 1} did not go through. Page said:\n${(await admin.page.locator("main").innerText()).slice(0, 1500)}\n${String(error).slice(0, 200)}`);
    });
  }

  // The customer now has stars and places an order with the seeded shop.
  await customer.page.goto("/account/stars");
  await expect(customer.page.locator("main")).toBeVisible();
  await customer.page.goto("/explore?type=restaurant");
  await customer.page.getByRole("link", { name: new RegExp(acc.seededShopName) }).click();
  await customer.page.getByRole("button", { name: "أضف كباب إلى السلة" }).click();
  await customer.page.goto("/checkout");
  await expectNoHorizontalScroll(customer.page);
  await customer.page.getByRole("button", { name: "تأكيد الطلب" }).click();
  await expect(customer.page).toHaveURL(/\/account\/orders\/[^/]+$/);

  // Customer sends the payment receipt for this shop.
  await customer.page.locator("input[name=referenceNo]").fill(`O-${tag}`);
  await customer.page.locator("input[type=file][name=receipt]").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: TINY_PNG });
  await customer.page.getByRole("button", { name: "إرسال الإيصال" }).click();

  // The shop confirms the transfer, accepts the order and prepares it.
  await shop.page.goto("/merchant/orders");
  for (const step of ["تأكيد استلام التحويل", "قبول الطلب", "بدء التجهيز", "الطلب جاهز"]) {
    const button = shop.page.getByRole("button", { name: step }).first();
    await expect(button, `shop step "${step}"`).toBeVisible({ timeout: 60_000 });
    await button.click();
    await expect(button).toBeHidden({ timeout: 60_000 });
  }

  // A driver signs up, sees the order on the board (without customer details), takes it, picks it up and delivers it.
  await signUp(driver.page, "DRIVER", `011${uniqueDigits()}`, `drv-${tag}@example.com`);
  await expect(driver.page).toHaveURL(/\/driver/);
  await driver.page.goto("/driver/board");
  const card = driver.page.locator("li", { hasText: acc.seededShopName });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card.getByText("شارع 9 المعادي")).toHaveCount(0); // the customer's address is not shown before accepting
  await card.getByRole("button", { name: "قبول الطلب" }).click();
  await expect(card).toBeHidden({ timeout: 60_000 }); // a claimed order leaves the open board
  await driver.page.goto("/driver/tasks");
  await driver.page.getByRole("button", { name: "استلمت الطلب من النشاط" }).click();
  await expect(driver.page.getByRole("button", { name: "تم التسليم" })).toBeVisible({ timeout: 30_000 }).catch(async (error: unknown) => {
    throw new Error(`pickup did not lead to delivery. Page said:\n${(await driver.page.locator("main").innerText()).slice(0, 1500)}\n${String(error).slice(0, 200)}`);
  });
  await driver.page.getByRole("button", { name: "تم التسليم" }).click();
  await expect(driver.page.getByRole("button", { name: "تم التسليم" })).toBeHidden();

  // Everyone sees the result: the customer sees the delivery and the driver's name.
  await customer.page.reload();
  await expect(customer.page.getByText("تم التسليم").first()).toBeVisible();
  await expect(customer.page.getByText("السائق: اختبار آلي")).toBeVisible();
  errors.assertClean();
  for (const p of [customer, shop, admin, driver]) await p.context.close();
});
