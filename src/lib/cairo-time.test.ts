import { describe, expect, it } from "vitest";
import { parseCairoLocal } from "./cairo-time";

describe("parseCairoLocal", () => {
  it("uses UTC+2 in winter", () => {
    expect(parseCairoLocal("2026-01-15T12:00")?.toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });

  it("uses UTC+3 during daylight saving", () => {
    expect(parseCairoLocal("2026-07-15T12:00")?.toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });

  it("rejects malformed or impossible dates", () => {
    for (const bad of ["", "garbage", "2026-02-30T10:00", "2026-13-01T10:00", "2026-01-01T24:00", "2026-01-01 10:00"]) {
      expect(parseCairoLocal(bad)).toBeNull();
    }
  });
});
