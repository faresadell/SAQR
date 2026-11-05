import "server-only";
import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    APP_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
    DATA_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, "must decode to 32 bytes"),
    // Shared secret for scheduled jobs (/api/internal/jobs/*). Unset = jobs are disabled (503).
    CRON_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(32).optional()),
    OTP_PROVIDER: z.enum(["console", "disabled", "http"]).default("console"),
    // Generic HTTP SMS gateway (only read when OTP_PROVIDER=http). See src/lib/sms/http-sms.ts for the request contract.
    SMS_API_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
    SMS_API_TOKEN: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(8).optional()),
    SMS_SENDER: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(20).optional()),
    // Email (Resend). Secrets only via environment variables.
    EMAIL_PROVIDER: z.enum(["console", "disabled", "resend"]).default("console"),
    RESEND_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(8).optional()),
    EMAIL_FROM: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(5).max(200).optional()),
    // Optional published Resend templates. Variables sent: code, minutes, app_name (they must exist in the template).
    RESEND_TEMPLATE_VERIFY_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(3).max(100).optional()),
    RESEND_TEMPLATE_RESET_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(3).max(100).optional()),
    // "Not a robot" check on sign-up (Cloudflare Turnstile). The site key is public (passed to the page by the server); the secret key only via environment.
    CAPTCHA_PROVIDER: z.enum(["disabled", "turnstile"]).default("disabled"),
    TURNSTILE_SECRET_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(8).optional()),
    TURNSTILE_SITE_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(8).optional()),
    // Private object storage for receipts and product images.
    STORAGE_PROVIDER: z.enum(["local", "r2"]).default("local"),
    R2_ACCOUNT_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^[a-f0-9]{32}$/).optional()),
    R2_BUCKET: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/).optional()),
    R2_ACCESS_KEY_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(8).optional()),
    R2_SECRET_ACCESS_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(16).optional()),
    // Trial deployment on a *.vercel.app address BEFORE the real domain exists: emails are printed to the server log
    // and the robot check may be off. Refused on any other address, so it can never run on the real domain.
    PREVIEW_MODE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .superRefine((env, ctx) => {
    const previewHost = (() => {
      try {
        return new URL(env.APP_URL).hostname.endsWith(".vercel.app");
      } catch {
        return false;
      }
    })();
    if (env.PREVIEW_MODE && !previewHost) {
      ctx.addIssue({ code: "custom", path: ["PREVIEW_MODE"], message: "PREVIEW_MODE is only allowed when APP_URL is a *.vercel.app address" });
    }
    // The three production guards below are skipped ONLY in a valid preview.
    const strict = env.NODE_ENV === "production" && !(env.PREVIEW_MODE && previewHost);
    if (strict && env.OTP_PROVIDER === "console") {
      ctx.addIssue({ code: "custom", path: ["OTP_PROVIDER"], message: "console OTP sender is not allowed in production" });
    }
    if (env.OTP_PROVIDER === "http") {
      if (!env.SMS_API_URL?.startsWith("https://")) ctx.addIssue({ code: "custom", path: ["SMS_API_URL"], message: "SMS_API_URL (https) is required when OTP_PROVIDER=http" });
      if (!env.SMS_API_TOKEN) ctx.addIssue({ code: "custom", path: ["SMS_API_TOKEN"], message: "SMS_API_TOKEN is required when OTP_PROVIDER=http" });
    }
    if (strict && env.EMAIL_PROVIDER === "console") {
      ctx.addIssue({ code: "custom", path: ["EMAIL_PROVIDER"], message: "console email sender is not allowed in production" });
    }
    if (env.CAPTCHA_PROVIDER === "turnstile") {
      if (!env.TURNSTILE_SECRET_KEY) ctx.addIssue({ code: "custom", path: ["TURNSTILE_SECRET_KEY"], message: "TURNSTILE_SECRET_KEY is required when CAPTCHA_PROVIDER=turnstile" });
      if (!env.TURNSTILE_SITE_KEY) ctx.addIssue({ code: "custom", path: ["TURNSTILE_SITE_KEY"], message: "TURNSTILE_SITE_KEY is required when CAPTCHA_PROVIDER=turnstile" });
    }
    if (strict && env.CAPTCHA_PROVIDER === "disabled") {
      ctx.addIssue({ code: "custom", path: ["CAPTCHA_PROVIDER"], message: "the sign-up robot check cannot be disabled in production" });
    }
    if (env.EMAIL_PROVIDER === "resend") {
      if (!env.RESEND_API_KEY) ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "RESEND_API_KEY is required when EMAIL_PROVIDER=resend" });
      if (!env.EMAIL_FROM || !/<?[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>?$/.test(env.EMAIL_FROM)) ctx.addIssue({ code: "custom", path: ["EMAIL_FROM"], message: "EMAIL_FROM must be an address on a domain verified in Resend" });
    }
    if (env.STORAGE_PROVIDER === "r2") {
      for (const key of ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when STORAGE_PROVIDER=r2` });
      }
    }
    if (env.NODE_ENV === "production" && !env.APP_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL must use https in production" });
    }
  });

export type Env = z.infer<typeof schema>;

/** Validate an environment source. Pure (no caching) so it can be tested. */
export function parseEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return schema.safeParse(source);
}

let cached: Env | undefined;

/** Validated server environment. Fails fast with a clear message instead of running misconfigured. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = parseEnv(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}
