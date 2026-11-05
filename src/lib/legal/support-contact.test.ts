import { describe, expect, it } from "vitest";
import { applySupportContact, SUPPORT_PLACEHOLDER } from "./support-contact";

const body = `## وسائل التواصل الرسمية\n${SUPPORT_PLACEHOLDER}\n`;

describe("support contact from the environment", () => {
  it("replaces the placeholder with both lines", () => {
    const out = applySupportContact(body, { whatsapp: "0102 562-0769", email: " a@b.eg " });
    expect(out).toBe("## وسائل التواصل الرسمية\n- واتساب: 01025620769\n- البريد الإلكتروني: a@b.eg\n");
  });
  it("works with only one of them", () => {
    expect(applySupportContact(body, { email: "a@b.eg" })).toContain("- البريد الإلكتروني: a@b.eg");
    expect(applySupportContact(body, { whatsapp: "01025620769" })).not.toContain("البريد");
  });
  it("ignores invalid values and does nothing when there is no valid contact", () => {
    expect(applySupportContact(body, { whatsapp: "abc", email: "not-an-email" })).toBeNull();
    expect(applySupportContact(body, {})).toBeNull();
  });
  it("never touches text whose placeholder was already replaced (an admin edit)", () => {
    expect(applySupportContact("نص عدّله الأدمن", { email: "a@b.eg" })).toBeNull();
  });
});
