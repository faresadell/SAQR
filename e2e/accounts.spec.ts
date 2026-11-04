import { expect, test } from "@playwright/test";
import { E2E_ADMIN_PW } from "./accounts";
import { expectNoHorizontalScroll, login, logout, signUp, skipIntro, USER_PASSWORD, uniqueDigits, watchErrors } from "./helpers";

const PASSWORD = USER_PASSWORD;

test("customer: sign up with an emailed code, change phone with the password, sign out, sign in with the new number", async ({ page }, testInfo) => {
  await skipIntro(page);
  const errors = watchErrors(page);
  const tag = `${testInfo.project.name}${uniqueDigits()}`;
  const phone = `010${uniqueDigits()}`;
  const newPhone = `011${uniqueDigits()}`;
  await signUp(page, "CUSTOMER", phone, `cust-${tag}@example.com`);
  await expect(page).toHaveURL(/\/account/);
  await expectNoHorizontalScroll(page);

  await page.goto("/account/profile");
  const form = page.locator("form", { has: page.locator("input[name=phone]") });
  await form.locator("input[name=phone]").fill(newPhone);
  await form.locator("input[name=password]").fill(`${PASSWORD}x`);
  await form.getByRole("button", { name: "تغيير الرقم" }).click();
  await expect(page.getByText("كلمة المرور غير صحيحة")).toBeVisible();
  await form.locator("input[name=password]").fill(PASSWORD);
  await form.getByRole("button", { name: "تغيير الرقم" }).click();
  await expect(page.getByText("تم تغيير الرقم")).toBeVisible();

  await logout(page);
  await login(page, newPhone, PASSWORD);
  await expect(page).toHaveURL(/\/account/);
  for (const path of ["/account", "/account/orders", "/account/stars", "/account/packages", "/account/notifications", "/account/addresses", "/account/rewards"]) {
    const r = await page.goto(path);
    expect(r?.status(), path).toBeLessThan(400);
    await expectNoHorizontalScroll(page);
  }
  errors.assertClean();
});

test("merchant and driver: sign up by email code and reach their own dashboards", async ({ page }, testInfo) => {
  await skipIntro(page);
  const errors = watchErrors(page);
  const tag = `${testInfo.project.name}${uniqueDigits()}`;
  await signUp(page, "MERCHANT", `010${uniqueDigits()}`, `merch-${tag}@example.com`);
  await expect(page).toHaveURL(/\/merchant/);
  for (const path of ["/merchant", "/merchant/profile", "/merchant/products", "/merchant/orders", "/merchant/offers", "/merchant/drivers", "/merchant/notifications"]) {
    const r = await page.goto(path);
    expect(r?.status(), path).toBeLessThan(400);
    await expectNoHorizontalScroll(page);
  }
  await page.context().clearCookies();
  await signUp(page, "DRIVER", `011${uniqueDigits()}`, `driver-${tag}@example.com`);
  await expect(page).toHaveURL(/\/driver/);
  for (const path of ["/driver", "/driver/board", "/driver/tasks", "/driver/history", "/driver/profile", "/driver/package"]) {
    const r = await page.goto(path);
    expect(r?.status(), path).toBeLessThan(400);
    await expectNoHorizontalScroll(page);
  }
  errors.assertClean();
});

test("wrong password is refused and a signed-out visitor sees nothing of the admin area", async ({ page }) => {
  await skipIntro(page);
  await login(page, "01099999999", E2E_ADMIN_PW);
  await expect(page).toHaveURL(/\/login/);
  const r = await page.goto("/admin");
  expect(r?.status()).toBeLessThan(500);
  await expect(page.getByText("لوحة الإدارة")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "التجار" })).toHaveCount(0);
});
