import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_ADMIN_PW, type E2eProject } from "./accounts";
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
  await login(admin.page, acc.adminPhone.replace("+20", "0"), E2E_ADMIN_PW);
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
  // The driver names the delivery price (pre-filled with the zone price); the customer must approve it before pickup.
  await driver.page.getByRole("button", { name: "إرسال السعر للعميل" }).click();
  await expect(driver.page.getByText("في انتظار موافقة العميل")).toBeVisible({ timeout: 60_000 });
  await customer.page.reload();
  await customer.page.getByRole("button", { name: "موافق" }).click();
  await expect(customer.page.getByText("وافقت على سعر التوصيل")).toBeVisible({ timeout: 60_000 });
  await driver.page.reload();
  const pickUp = driver.page.getByRole("button", { name: "استلمت الطلب من النشاط" });
  await pickUp.click();
  await expect(pickUp).toBeHidden({ timeout: 60_000 });
  await driver.page.goto("/driver/trip"); // picked-up orders move to "قيد التوصيل"
  await expect(driver.page.getByRole("button", { name: "تم التسليم" })).toBeVisible({ timeout: 30_000 }).catch(async (error: unknown) => {
    throw new Error(`pickup did not lead to delivery. Page said:\n${(await driver.page.locator("main").innerText()).slice(0, 1500)}\n${String(error).slice(0, 200)}`);
  });
  // The handover code is shown only to the customer; a wrong code is refused, the right one delivers.
  await customer.page.reload();
  const handoverCode = (await customer.page.getByTestId("delivery-code").innerText()).trim();
  expect(handoverCode).toMatch(/^\d{4}$/);
  await driver.page.getByLabel("كود التسليم (من العميل)").fill(handoverCode === "0000" ? "1111" : "0000");
  await driver.page.getByRole("button", { name: "تم التسليم" }).click();
  await expect(driver.page.getByText("كود التسليم غير صحيح")).toBeVisible();
  await driver.page.getByLabel("كود التسليم (من العميل)").fill(handoverCode);
  await driver.page.getByRole("button", { name: "تم التسليم" }).click();
  await expect(driver.page.getByRole("button", { name: "تم التسليم" })).toBeHidden();

  // Everyone sees the result: the customer sees the delivery and the driver's name.
  await customer.page.reload();
  await expect(customer.page.getByText("تم التسليم").first()).toBeVisible();
  await expect(customer.page.getByText("السائق: اختبار آلي")).toBeVisible();
  // A second way to order: the customer writes what they want, the shop answers once with a final price, the customer agrees.
  await customer.page.goto("/explore?type=restaurant");
  await customer.page.getByRole("link", { name: new RegExp(acc.seededShopName) }).click();
  await customer.page.getByRole("link", { name: "اطلب بكلماتك" }).click();
  await customer.page.locator("textarea[name=body]").fill("عاوز ٢ كيلو كفتة مشكلة مع سلطة");
  await customer.page.locator("select[name=addressId]").selectOption({ index: 1 });
  await customer.page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(customer.page.getByText("بانتظار السعر").first()).toBeVisible({ timeout: 30_000 });
  await shop.page.goto("/merchant/requests");
  await shop.page.getByRole("link", { name: /عاوز ٢ كيلو كفتة/ }).first().click();
  await shop.page.locator("input[name=price]").fill("350");
  await shop.page.getByRole("button", { name: "إرسال السعر" }).click();
  await expect(shop.page.getByText("تم تحديد السعر").first()).toBeVisible({ timeout: 30_000 });
  await customer.page.reload();
  await expect(customer.page.getByText("تم تحديد السعر").first()).toBeVisible({ timeout: 30_000 });
  await customer.page.getByRole("button", { name: "موافق على السعر وإنشاء الطلب" }).click();
  // Agreeing creates a normal order: the customer lands on it, ready to pay, and the shop sees it in its orders.
  await expect(customer.page).toHaveURL(/\/account\/orders\/[^/]+$/, { timeout: 30_000 });
  await expect(customer.page.locator("input[name=referenceNo]")).toBeVisible({ timeout: 30_000 });
  await shop.page.goto("/merchant/orders");
  await expect(shop.page.getByText("طلب مخصص: عاوز ٢ كيلو كفتة").first()).toBeVisible({ timeout: 30_000 }).catch(async () => {
    throw new Error(`the accepted request did not show in the shop's orders. Page said:\n${(await shop.page.locator("main").innerText()).slice(0, 1500)}`);
  });

  // A third way: order from inside the chat. Customer writes it there, the shop sets the price in the chat, the customer agrees and pays.
  await customer.page.goto("/explore?type=restaurant");
  await customer.page.getByRole("link", { name: new RegExp(acc.seededShopName) }).click();
  await customer.page.getByRole("link", { name: "ابدأ محادثة مع النشاط" }).click();
  await customer.page.locator("textarea[name=body]").fill("السلام عليكم، عندكم كباب؟");
  await customer.page.getByRole("button", { name: "بدء المحادثة" }).click();
  await expect(customer.page).toHaveURL(/\/account\/chats\/[^/]+$/, { timeout: 30_000 });
  await expect(customer.page.getByRole("heading", { name: "اطلب من هنا" })).toBeVisible({ timeout: 30_000 });
  await customer.page.locator("textarea[name=body]").last().fill("عاوز ٣ كيلو كباب من الشات");
  await customer.page.locator("select[name=addressId]").selectOption({ index: 1 });
  await customer.page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(customer.page.getByText("بانتظار السعر").first()).toBeVisible({ timeout: 30_000 });
  await expect(customer.page).toHaveURL(/\/account\/chats\//); // still in the chat
  await shop.page.goto("/merchant/chats");
  await shop.page.locator("a[href^='/merchant/chats/']").first().click();
  await shop.page.locator("input[name=price]").fill("420");
  await shop.page.getByRole("button", { name: "إرسال السعر" }).click();
  await expect(shop.page.getByText("تم تحديد السعر").first()).toBeVisible({ timeout: 30_000 });
  await customer.page.reload();
  await customer.page.getByRole("button", { name: "موافق على السعر وإنشاء الطلب" }).click();
  await expect(customer.page).toHaveURL(/\/account\/orders\/[^/]+$/, { timeout: 30_000 });
  await expect(customer.page.locator("input[name=referenceNo]")).toBeVisible({ timeout: 30_000 });

  errors.assertClean();
  for (const p of [customer, shop, admin, driver]) await p.context.close();
});
