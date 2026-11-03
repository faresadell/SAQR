import { describe, expect, it } from "vitest";
import { parseSocialLinks, validateShopContact } from "./shop-contact";

describe("validateShopContact", () => {
  it("accepts mobiles, landlines and hotlines (one per line or comma separated), de-duplicated", () => {
    const r = validateShopContact({ phones: "01012345678\n٠١٠١٢٣٤٥٦٧٨, 0223456789, 19999" });
    expect(r).toEqual({ ok: true, value: { contactPhones: ["+201012345678", "0223456789", "19999"], socialLinks: null } });
  });
  it("rejects junk numbers and more than five", () => {
    expect(validateShopContact({ phones: "abc" })).toMatchObject({ ok: false, errors: { contactPhones: expect.any(String) } });
    expect(validateShopContact({ phones: "1,22222,33333,44444,55555,66666" })).toMatchObject({ ok: false });
  });
  it("accepts https links on the platform's own domain and a WhatsApp mobile", () => {
    const r = validateShopContact({ facebook: "https://www.facebook.com/shop", instagram: "https://instagram.com/shop", whatsapp: "01012345678", website: "https://example.com/menu" });
    expect(r).toMatchObject({ ok: true, value: { socialLinks: { facebook: "https://www.facebook.com/shop", whatsapp: "+201012345678", website: "https://example.com/menu" } } });
  });
  it("refuses javascript:, data:, http:, credentials and links on the wrong domain", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://example.com", "https://user:pw@example.com"]) {
      expect(validateShopContact({ website: bad }).ok).toBe(false);
    }
    expect(validateShopContact({ facebook: "https://evil.com/facebook.com" }).ok).toBe(false);
    expect(validateShopContact({ instagram: "https://notinstagram.com/x" }).ok).toBe(false);
    expect(validateShopContact({ whatsapp: "123" }).ok).toBe(false);
  });
});

describe("parseSocialLinks", () => {
  it("drops anything that is not a valid stored value", () => {
    expect(parseSocialLinks({ facebook: "javascript:alert(1)", website: "https://example.com/", whatsapp: "+201012345678", extra: "x" })).toEqual({ website: "https://example.com/", whatsapp: "+201012345678" });
    expect(parseSocialLinks(null)).toEqual({});
    expect(parseSocialLinks("x")).toEqual({});
  });
});
