/**
 * "Not a robot" check with Cloudflare Turnstile. The server verifies the token the widget produced; a missing or
 * rejected token means no account is created. `fetchFn` is injectable so it is unit-tested without the network.
 */
export type CaptchaFetch = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: string | null | undefined,
  secret: string,
  ip: string,
  fetchFn: CaptchaFetch = (url, init) => fetch(url, init as RequestInit) as ReturnType<CaptchaFetch>,
): Promise<boolean> {
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchFn(TURNSTILE_VERIFY_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(), signal: controller.signal });
    if (!response.ok) return false;
    const data = (await response.json()) as { success?: unknown };
    return data.success === true;
  } catch {
    return false; // when in doubt, do not create the account
  } finally {
    clearTimeout(timer);
  }
}
