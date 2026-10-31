import { describe, expect, it } from "vitest";
import { sendCodeEmail, type FetchLike } from "./resend";

function recorder(ok = true, status = 200) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
    return { ok, status };
  };
  return { calls, fetchFn };
}
const config = { apiKey: "re_test_key_123", from: "SAQR <no-reply@example.com>" };

describe("Resend sender", () => {
  it("sends the plain Arabic message with a bearer key when no template is configured", async () => {
    const { calls, fetchFn } = recorder();
    await sendCodeEmail(config, "user@example.com", "PASSWORD_RESET", "123456", fetchFn);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.headers.authorization).toBe("Bearer re_test_key_123");
    expect(calls[0]!.body).toMatchObject({ from: config.from, to: ["user@example.com"] });
    expect(String(calls[0]!.body.html)).toContain("123456");
    expect(calls[0]!.body.template).toBeUndefined();
  });

  it("uses the published template with variables when one is configured for the purpose", async () => {
    const { calls, fetchFn } = recorder();
    await sendCodeEmail({ ...config, templateIds: { VERIFY_EMAIL: "tpl_verify" } }, "user@example.com", "VERIFY_EMAIL", "654321", fetchFn);
    expect(calls[0]!.body.template).toEqual({ id: "tpl_verify", variables: { code: "654321", minutes: 10, app_name: "صقر" } });
    expect(calls[0]!.body.html).toBeUndefined();
    await sendCodeEmail({ ...config, templateIds: { VERIFY_EMAIL: "tpl_verify" } }, "user@example.com", "PASSWORD_RESET", "654321", fetchFn);
    expect(calls[1]!.body.template).toBeUndefined(); // no template for that purpose: falls back to plain
  });

  it("fails without leaking the code or key, and rejects malformed input", async () => {
    const { fetchFn } = recorder(false, 403);
    const error = await sendCodeEmail(config, "user@example.com", "PASSWORD_RESET", "123456", fetchFn).catch((e: Error) => e);
    expect((error as Error).message).toBe("Email provider answered 403");
    await expect(sendCodeEmail(config, "bad-address", "PASSWORD_RESET", "123456", fetchFn)).rejects.toThrow("Invalid email arguments");
    await expect(sendCodeEmail(config, "user@example.com", "PASSWORD_RESET", "12", fetchFn)).rejects.toThrow("Invalid email arguments");
  });
});
