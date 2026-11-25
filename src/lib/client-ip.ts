import "server-only";
import { headers } from "next/headers";
import { getEnv } from "@/lib/env";

/**
 * The caller's IP. On Vercel the platform sets x-vercel-forwarded-for itself (a client cannot forge it), so it is always trusted there.
 * Elsewhere only when TRUST_PROXY is on (a proxy we control overwrites X-Forwarded-For); otherwise the header is attacker-controlled,
 * so we return "unknown" and rely on per-account limits.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  if (process.env.VERCEL) {
    const vercel = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
    if (vercel && vercel.length <= 64) return vercel;
  }
  if (!getEnv().TRUST_PROXY) return "unknown";
  const forwarded = h.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length <= 64 ? first : "unknown";
}
