import "server-only";
import type { OtpPurpose } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { sendOtpViaHttp } from "@/lib/sms/http-sms";

export interface OtpSender {
  send(phone: string, code: string, purpose: OtpPurpose): Promise<void>;
}

/** Development only: prints the code to the server log. env.ts refuses this in production. */
class ConsoleOtpSender implements OtpSender {
  async send(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
    console.info(`[DEV ONLY] ${purpose} code for ${phone}: ${code}`);
  }
}

class DisabledOtpSender implements OtpSender {
  async send(): Promise<void> {
    throw new Error("No OTP provider is configured");
  }
}

/** Generic HTTP gateway. Needs a real provider account and its contract; see docs/DEPLOYMENT.md. */
class HttpOtpSender implements OtpSender {
  async send(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
    const env = getEnv();
    await sendOtpViaHttp({ url: env.SMS_API_URL!, token: env.SMS_API_TOKEN!, sender: env.SMS_SENDER }, phone, purpose, code, (url, init) => fetch(url, init));
  }
}

/** Real SMS / WhatsApp providers plug in here without touching the auth flow. */
export function getOtpSender(): OtpSender {
  switch (getEnv().OTP_PROVIDER) {
    case "console":
      return new ConsoleOtpSender();
    case "disabled":
      return new DisabledOtpSender();
    case "http":
      return new HttpOtpSender();
  }
}
