import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";

describe("buildCsp (production)", () => {
  const csp = buildCsp({ nonce: "abc123", isDev: false });

  it("allows scripts only from self and the request nonce", () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("unsafe-inline");
  });

  it("blocks framing, plugins and base-tag hijacking", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("upgrades insecure requests", () => {
    expect(csp).toContain("upgrade-insecure-requests");
  });
});

describe("buildCsp (development)", () => {
  it("only relaxes what Next.js dev tooling needs", () => {
    const csp = buildCsp({ nonce: "x", isDev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
