import "server-only";
import path from "node:path";
import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    APP_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
    DATA_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, "must decode to 32 bytes"),
    OTP_PROVIDER: z.enum(["console", "disabled"]).default("console"),
    // Private directory for uploads (payment receipts, logos). Never served by the web server.
    STORAGE_DIR: z.string().min(1).default("./.private-storage"),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.OTP_PROVIDER === "console") {
      ctx.addIssue({ code: "custom", path: ["OTP_PROVIDER"], message: "console OTP sender is not allowed in production" });
    }
    if (env.NODE_ENV === "production" && !path.isAbsolute(env.STORAGE_DIR)) {
      ctx.addIssue({ code: "custom", path: ["STORAGE_DIR"], message: "STORAGE_DIR must be an absolute path on a persistent volume in production" });
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
