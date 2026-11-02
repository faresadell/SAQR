const CAPTCHA_ORIGIN = "https://challenges.cloudflare.com";

export interface CspOptions {
  nonce: string;
  isDev: boolean;
}

/**
 * Strict Content-Security-Policy.
 * - Scripts: same-origin + per-request nonce ('strict-dynamic'); no inline script without the nonce.
 * - No framing (clickjacking), no plugins, no base-tag hijacking, forms post to self only.
 * - Development relaxes only what Next.js dev tooling needs.
 */
export function buildCsp({ nonce, isDev }: CspOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": isDev ? ["'self'", "'unsafe-inline'"] : ["'self'", `'nonce-${nonce}'`],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", CAPTCHA_ORIGIN, ...(isDev ? ["ws:", "wss:"] : [])],
    "frame-src": [CAPTCHA_ORIGIN], // the "not a robot" widget (Cloudflare Turnstile) is the only thing we embed
    "manifest-src": ["'self'"],
    "worker-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
