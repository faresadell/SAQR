import { describe, expect, it } from "vitest";
import { otpMessage, sendOtpViaHttp, type FetchLike } from "./http-sms";

const cfg = { url: "https://sms.example.test/send", token: "secret-token", sender: "SAQR" };

describe("sendOtpViaHttp", () => {
  it("posts JSON with a bearer token and the code in the message", async () => {
    let seen: { url: string; headers: Record<string, string>; body: string } | undefined;
    const fake: FetchLike = async (url, init) => {
      seen = { url, headers: init.headers, body: init.body };
      return { ok: true, status: 200 };
    };
    await sendOtpViaHttp(cfg, "+201012345678", "PASSWORD_RESET", "123456", fake);
    expect(seen?.url).toBe(cfg.url);
    expect(seen?.headers["authorization"]).toBe("Bearer secret-token");
    const body = JSON.parse(seen!.body) as { to: string; message: string; sender: string };
    expect(body).toMatchObject({ to: "+201012345678", sender: "SAQR" });
    expect(body.message).toContain("123456");
  });

  it("fails on a non-2xx answer without leaking the code or token", async () => {
    const fake: FetchLike = async () => ({ ok: false, status: 503 });
    const error = await sendOtpViaHttp(cfg, "+201012345678", "SIGNUP", "654321", fake).catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("SMS gateway answered 503");
    expect((error as Error).message).not.toContain("654321");
  });

  it("refuses malformed phone or code before calling the network", async () => {
    let called = false;
    const fake: FetchLike = async () => {
      called = true;
      return { ok: true, status: 200 };
    };
    await expect(sendOtpViaHttp(cfg, "abc", "SIGNUP", "123456", fake)).rejects.toThrow();
    await expect(sendOtpViaHttp(cfg, "+201012345678", "SIGNUP", "12", fake)).rejects.toThrow();
    expect(called).toBe(false);
  });

  it("has a message for each purpose", () => {
    for (const p of ["SIGNUP", "LOGIN", "PASSWORD_RESET"]) expect(otpMessage(p, "111111")).toContain("111111");
  });
});
