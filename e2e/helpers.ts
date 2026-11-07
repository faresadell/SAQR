import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { E2E_USER_PW } from "./accounts";

/** The intro screen blocks clicks on the first visit of a session; tests that are not about it mark it as seen. */
export async function skipIntro(page: Page): Promise<void> {
  await page.addInitScript(() => window.sessionStorage.setItem("saqr_intro_seen", "1"));
}

/** Collects page errors and console errors; `assertClean` fails with what was seen. */
export function watchErrors(page: Page) {
  const seen: string[] = [];
  page.on("pageerror", (e) => seen.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) seen.push(`console: ${m.text().slice(0, 300)}`);
  });
  return { assertClean: () => expect(seen, seen.join("\n")).toEqual([]) };
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page is wider than the screen").toBeLessThanOrEqual(1);
}

/** The development server prints each emailed code to its log. This reads the newest one for an address. */
export async function emailedCode(email: string): Promise<string> {
  const file = process.env.DEV_LOG;
  if (!file) throw new Error("DEV_LOG must point at the development server log");
  const marker = `email code for ${email}: `;
  let code = "";
  await expect
    .poll(() => {
      const line = readFileSync(file, "utf8").split("\n").filter((l) => l.includes(marker)).at(-1) ?? "";
      const candidate = line.slice(line.indexOf(marker) + marker.length).trim();
      code = candidate.length === 6 && [...candidate].every((c) => c >= "0" && c <= "9") ? candidate : "";
      return code;
    }, { timeout: 30_000, message: `no emailed code for ${email} in the server log` })
    .not.toBe("");
  return code;
}

export const uniqueDigits = (): string => String(Date.now()).slice(-8);

/** A valid 1x1 PNG. */
export const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

export const USER_PASSWORD = E2E_USER_PW;

/** Registers through the real form and activates with the code the server "emailed" (printed in the dev log). */
export async function signUp(page: Page, role: "CUSTOMER" | "MERCHANT" | "DRIVER", phone: string, email: string): Promise<void> {
  await page.goto(`/register?role=${role.toLowerCase()}`);
  await page.locator("input[name=firstName]").fill("اختبار");
  await page.locator("input[name=lastName]").fill("آلي");
  await page.locator("input[name=phone]").fill(phone);
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(USER_PASSWORD);
  await page.locator("input[name=consent]").check();
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page).toHaveURL(/\/verify/);
  await page.locator("input[name=code]").fill(await emailedCode(email));
  await page.getByRole("button", { name: "تأكيد" }).click();
}

export async function login(page: Page, identifier: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator("input[name=identifier]").fill(identifier);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: "دخول" }).click();
}

/** On a phone the sign-out button lives in the side menu; on desktop it is always on screen. */
export async function logout(page: Page): Promise<void> {
  const button = page.locator('button[aria-label="تسجيل الخروج"]:visible');
  if ((await button.count()) === 0) await page.getByRole("button", { name: "فتح القائمة" }).click();
  await button.click();
}
