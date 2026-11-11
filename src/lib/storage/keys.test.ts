import { describe, expect, it } from "vitest";
import { isValidObjectKey, newObjectKey } from "./keys";

describe("storage keys", () => {
  it("are generated in the expected shape and are unique", () => {
    const now = new Date("2026-11-12T10:00:00Z");
    const a = newObjectKey("receipts", "png", now);
    const b = newObjectKey("receipts", "png", now);
    expect(a).toMatch(/^receipts\/2026\/11\/[a-f0-9]{32}\.png$/);
    expect(a).not.toBe(b);
    expect(isValidObjectKey(a)).toBe(true);
  });

  it("refuse unknown areas and extensions", () => {
    expect(() => newObjectKey("../etc" as never, "png")).toThrow();
    expect(() => newObjectKey("receipts", "svg")).toThrow();
    expect(() => newObjectKey("receipts", "php")).toThrow();
  });

  it("reject anything that could escape the storage folder", () => {
    for (const bad of [
      "../secret.png",
      "receipts/../../etc/passwd",
      "/etc/passwd",
      "receipts/2026/11/../../x.png",
      "receipts/2026/11/abc.png",
      "receipts/2026/11/" + "a".repeat(32) + ".svg",
      "receipts/2026/11/" + "a".repeat(32) + ".png/../x",
      "receipts\\2026\\11\\" + "a".repeat(32) + ".png",
      "other/2026/11/" + "a".repeat(32) + ".png",
      "",
    ]) {
      expect(isValidObjectKey(bad), bad).toBe(false);
    }
  });
});
