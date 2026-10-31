import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "./safe-url";

describe("safeExternalUrl", () => {
  it("allows http and https links", () => {
    expect(safeExternalUrl("https://maps.google.com/?q=30,31")).toContain("https://maps.google.com");
    expect(safeExternalUrl("http://example.com/a")).toContain("http://example.com");
  });
  it("blocks other schemes and garbage", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl("")).toBeNull();
  });
});
