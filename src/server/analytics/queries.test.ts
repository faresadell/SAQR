import { describe, expect, it } from "vitest";
import { fillDays, WINDOW_DAYS } from "./queries";

describe("fillDays", () => {
  it("returns exactly 30 consecutive days ending today, with real zeros for quiet days", () => {
    const now = new Date("2026-11-16T10:00:00Z");
    const out = fillDays([{ day: "2026-11-10", count: 3, cents: 900 }], now);
    expect(out).toHaveLength(WINDOW_DAYS);
    expect(out.at(-1)?.day).toBe("2026-11-16");
    expect(out[0]?.day).toBe("2026-10-18");
    expect(out.find((d) => d.day === "2026-11-10")).toEqual({ day: "2026-11-10", count: 3, cents: 900 });
    expect(out.find((d) => d.day === "2026-11-11")).toEqual({ day: "2026-11-11", count: 0, cents: 0 });
  });
});
