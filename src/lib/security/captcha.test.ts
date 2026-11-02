import { describe, expect, it, vi } from "vitest";
import { TURNSTILE_VERIFY_URL, verifyTurnstile } from "./captcha";

const reply = (ok: boolean, json: unknown) => vi.fn(async () => ({ ok, json: async () => json }));

describe("verifyTurnstile", () => {
  it("accepts only an explicit success from Cloudflare", async () => {
    expect(await verifyTurnstile("t".repeat(20), "sec", "1.2.3.4", reply(true, { success: true }))).toBe(true);
    expect(await verifyTurnstile("t".repeat(20), "sec", "1.2.3.4", reply(true, { success: false }))).toBe(false);
    expect(await verifyTurnstile("t".repeat(20), "sec", "1.2.3.4", reply(true, { success: "true" }))).toBe(false);
    expect(await verifyTurnstile("t".repeat(20), "sec", "1.2.3.4", reply(false, { success: true }))).toBe(false);
  });
  it("rejects missing, short or oversized tokens without calling Cloudflare", async () => {
    const f = reply(true, { success: true });
    for (const token of [undefined, null, "", "short", "x".repeat(5000)]) expect(await verifyTurnstile(token, "sec", "unknown", f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("fails closed when the network call throws, and sends the secret only to the official URL", async () => {
    expect(await verifyTurnstile("t".repeat(20), "sec", "unknown", vi.fn(async () => { throw new Error("down"); }))).toBe(false);
    const f = reply(true, { success: true });
    await verifyTurnstile("t".repeat(20), "sec", "9.9.9.9", f);
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(init.body).toContain("secret=sec");
    expect(init.body).toContain("remoteip=9.9.9.9");
  });
});
