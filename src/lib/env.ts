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
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.OTP_PROVIDER === "console") {
      ctx.addIssue({ code: "custom", path: ["OTP_PROVIDER"], message: "console OTP sender is not allowed in production" });
    }
    if (env.OTP_PROVIDER === "http") {
      if (!env.SMS_API_URL?.startsWith("https://")) ctx.addIssue({ code: "custom", path: ["SMS_API_URL"], message: "SMS_API_URL (https) is required when OTP_PROVIDER=http" });
      if (!env.SMS_API_TOKEN) ctx.addIssue({ code: "custom", path: ["SMS_API_TOKEN"], message: "SMS_API_TOKEN is required when OTP_PROVIDER=http" });
    }
    if (env.NODE_ENV === "production" && !env.APP_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL must use https in production" });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment. Fails fast with a clear message instead of running misconfigured. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}
