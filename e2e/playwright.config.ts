import { defineConfig, devices } from "@playwright/test";

/** Real-browser checks of the running site, on a phone-sized and a desktop-sized screen. */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  retries: 0, // authenticator codes cannot be replayed, so a retry would only hide the first failure
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "../e2e-results",
  use: { baseURL: "http://localhost:3000", locale: "ar-EG", screenshot: "only-on-failure", trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
