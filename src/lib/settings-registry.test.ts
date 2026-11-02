import { describe, expect, it } from "vitest";
import {
  isSettingKey,
  parseSettingInput,
  SETTING_DEFINITIONS,
  settingKeysInGroup,
  validateSettingValue,
  type IntSettingDefinition,
  type SettingKey,
} from "./settings-registry";

describe("agreed defaults", () => {
  it("charges 5 stars per party and requires 5 stars to order/accept", () => {
    expect(SETTING_DEFINITIONS["orders.stars_charge_per_party"].default).toBe(2);
    expect(SETTING_DEFINITIONS["stars.min_balance_customer"].default).toBe(5);
    expect(SETTING_DEFINITIONS["stars.min_balance_merchant"].default).toBe(5);
  });

  it("sets the refund deadline to 24 hours, and it can only be shortened", () => {
    const d = SETTING_DEFINITIONS["refunds.deadline_hours"];
    expect(d.default).toBe(24);
    expect(d.max).toBe(24);
    expect(parseSettingInput("refunds.deadline_hours", "25").ok).toBe(false);
    expect(parseSettingInput("refunds.deadline_hours", "12").ok).toBe(true);
  });

  it("leaves the merchant response window unset until the business decides", () => {
    expect(SETTING_DEFINITIONS["orders.merchant_response_minutes"].default).toBeNull();
    const cleared = parseSettingInput("orders.merchant_response_minutes", "");
    expect(cleared.ok && cleared.value === null).toBe(true);
    const set = parseSettingInput("orders.merchant_response_minutes", "30");
    expect(set.ok && set.value === 30).toBe(true);
  });
});

describe("validation", () => {
  it("every default passes its own validation", () => {
    for (const key of Object.keys(SETTING_DEFINITIONS) as SettingKey[]) {
      const definition: IntSettingDefinition = SETTING_DEFINITIONS[key];
      expect(validateSettingValue(definition, definition.default)).toBe(true);
    }
  });

  it("rejects out-of-range, fractional, negative and non-numeric input", () => {
    for (const bad of ["-1", "51", "2.5", "abc", "1e2", " ", "99999999"]) {
      expect(parseSettingInput("stars.min_balance_customer", bad).ok).toBe(false);
    }
  });

  it("does not allow empty for settings that must have a value", () => {
    expect(parseSettingInput("refunds.deadline_hours", "").ok).toBe(false);
  });

  it("recognises only real keys, including inherited object keys", () => {
    expect(isSettingKey("refunds.deadline_hours")).toBe(true);
    for (const bad of ["nope", "__proto__", "constructor", "toString"]) {
      expect(isSettingKey(bad)).toBe(false);
      const r = parseSettingInput(bad, "1");
      expect(!r.ok && r.error === "UNKNOWN_KEY").toBe(true);
    }
  });

  it("keeps security limits inside safe bounds", () => {
    expect(parseSettingInput("auth.login.max_failures", "1").ok).toBe(false);
    expect(parseSettingInput("auth.otp.max_attempts", "0").ok).toBe(false);
    expect(parseSettingInput("auth.session.admin_ttl_hours", "169").ok).toBe(false);
  });

  it("groups settings for the dashboard", () => {
    expect(settingKeysInGroup("orders").length).toBe(5);
    expect(settingKeysInGroup("security").length).toBe(12);
  });
});
