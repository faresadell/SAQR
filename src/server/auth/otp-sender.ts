import "server-only";
import type { OtpPurpose } from "@prisma/client";
import { getEnv } from "@/lib/env";

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

/** Real SMS / WhatsApp providers plug in here (Phase 9) without touching the auth flow. */
export function getOtpSender(): OtpSender {
  switch (getEnv().OTP_PROVIDER) {
    case "console":
      return new ConsoleOtpSender();
    case "disabled":
      return new DisabledOtpSender();
  }
}
