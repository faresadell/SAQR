import "server-only";
import { getEnv } from "@/lib/env";
import { sendCodeEmail, type EmailPurpose } from "@/lib/email/resend";

export interface EmailSender {
  send(to: string, purpose: EmailPurpose, code: string): Promise<void>;
}

/** Development only: prints the code to the server log. env.ts refuses this in production. */
class ConsoleEmailSender implements EmailSender {
  async send(to: string, purpose: EmailPurpose, code: string): Promise<void> {
    console.info(`[DEV ONLY] ${purpose} email code for ${to}: ${code}`);
  }
}

class DisabledEmailSender implements EmailSender {
  async send(): Promise<void> {
    throw new Error("No email provider is configured");
  }
}

class ResendEmailSender implements EmailSender {
  async send(to: string, purpose: EmailPurpose, code: string): Promise<void> {
    const env = getEnv();
    await sendCodeEmail(
      { apiKey: env.RESEND_API_KEY!, from: env.EMAIL_FROM!, templateIds: { VERIFY_EMAIL: env.RESEND_TEMPLATE_VERIFY_ID, PASSWORD_RESET: env.RESEND_TEMPLATE_RESET_ID } },
      to,
      purpose,
      code,
      (url, init) => fetch(url, init),
    );
  }
}

let override: EmailSender | undefined;
/** Tests can capture outgoing codes. */
export function setEmailSenderForTests(sender: EmailSender | undefined): void {
  override = sender;
}

export function getEmailSender(): EmailSender {
  if (override) return override;
  switch (getEnv().EMAIL_PROVIDER) {
    case "console":
      return new ConsoleEmailSender();
    case "disabled":
      return new DisabledEmailSender();
    case "resend":
      return new ResendEmailSender();
  }
}
