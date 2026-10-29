import "server-only";
import { headers } from "next/headers";
import { getEnv } from "@/lib/env";

/**
 * The caller's IP, only when TRUST_PROXY is on (i.e. a proxy we control overwrites X-Forwarded-For).
 * Otherwise the header is attacker-controlled, so we return "unknown" and rely on per-account limits.
 */
export async function getClientIp(): Promise<string> {
  if (!getEnv().TRUST_PROXY) return "unknown";
  const forwarded = (await headers()).get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length <= 64 ? first : "unknown";
}
