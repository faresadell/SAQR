"use client";

import Script from "next/script";

/**
 * Cloudflare Turnstile "I am not a robot" widget. It adds the hidden field `cf-turnstile-response` to the surrounding
 * form; the server verifies it. Renders nothing when no site key is configured (development only: production refuses that).
 */
export function Turnstile({ siteKey, nonce }: { siteKey: string | null; nonce?: string }) {
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} async defer />
      <div className="cf-turnstile" data-sitekey={siteKey} data-language="ar" data-theme="auto" />
    </>
  );
}
