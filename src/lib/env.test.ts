import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/lib/env";

vi.mock("server-only", () => ({}));

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  SESSION_SECRET: "s".repeat(40),
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  NODE_ENV: "production",
};
const fields = (env: Record<string, string>) => {
  const r = parseEnv(env);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

describe("production environment guards", () => {
  it("refuse console email, console OTP and a disabled robot check on a real domain", () => {
    expect(fields({ ...base, APP_URL: "https://saqr.example" })).toEqual(expect.arrayContaining(["OTP_PROVIDER", "EMAIL_PROVIDER", "CAPTCHA_PROVIDER"]));
  });
  it("PREVIEW_MODE relaxes them on a *.vercel.app address only", () => {
    expect(fields({ ...base, APP_URL: "https://saqr-eta.vercel.app", PREVIEW_MODE: "true" })).toEqual([]);
  });
  it("PREVIEW_MODE is refused on any other address, and the guards stay on", () => {
    const f = fields({ ...base, APP_URL: "https://saqr.example", PREVIEW_MODE: "true" });
    expect(f).toEqual(expect.arrayContaining(["PREVIEW_MODE", "EMAIL_PROVIDER", "CAPTCHA_PROVIDER"]));
  });
  it("a lookalike host does not count as vercel.app", () => {
    expect(fields({ ...base, APP_URL: "https://evil-vercel.app.example.com", PREVIEW_MODE: "true" })).toContain("PREVIEW_MODE");
  });
  it("a fully configured real deployment passes", () => {
    expect(
      fields({ ...base, APP_URL: "https://saqr.example", OTP_PROVIDER: "disabled", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_12345678", EMAIL_FROM: "صقر <no-reply@saqr.example>", CAPTCHA_PROVIDER: "turnstile", TURNSTILE_SECRET_KEY: "12345678", TURNSTILE_SITE_KEY: "12345678" }),
    ).toEqual([]);
  });
});
