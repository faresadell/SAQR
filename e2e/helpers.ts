import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

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
  const file = process.env.DEV_LOG ?? "/tmp/saqr-dev.log";
  const pattern = new RegExp(`email code for ${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: (\\d{6})`, "g");
  let code = "";
  await expect
    .poll(() => {
      const all = [...readFileSync(file, "utf8").matchAll(pattern)];
      code = all.at(-1)?.[1] ?? "";
      return code;
    }, { timeout: 30_000, message: `no emailed code for ${email} in the server log` })
    .not.toBe("");
  return code;
}

export const uniqueDigits = (): string => String(Date.now()).slice(-8);

/** A valid 1x1 PNG. */
export const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
