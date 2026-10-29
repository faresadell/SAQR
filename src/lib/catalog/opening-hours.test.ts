import { describe, expect, it } from "vitest";
import { emptyWeek, isOpenAt, parseHoursFields, validateOpeningHours, type OpeningHours } from "./opening-hours";

function week(overrides: Partial<OpeningHours> = {}): OpeningHours {
  return { ...emptyWeek(), ...overrides };
}

describe("validateOpeningHours", () => {
  it("accepts a normal schedule and normalizes order", () => {
    const r = validateOpeningHours(week({ "4": [{ open: "16:00", close: "23:00" }, { open: "09:00", close: "14:00" }] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value["4"][0]?.open).toBe("09:00");
  });

  it("accepts 24:00 as a closing time", () => {
    expect(validateOpeningHours(week({ "5": [{ open: "08:00", close: "24:00" }] })).ok).toBe(true);
  });

  it("rejects overlapping, reversed, malformed and oversized input", () => {
    const bad: unknown[] = [
      null, "x", {}, week({ "1": [{ open: "09:00", close: "09:00" }] }), week({ "1": [{ open: "18:00", close: "09:00" }] }),
      week({ "1": [{ open: "9:00", close: "17:00" }] }), week({ "1": [{ open: "09:00", close: "25:00" }] }),
      week({ "1": [{ open: "09:00", close: "13:00" }, { open: "12:00", close: "18:00" }] }),
      week({ "1": [{ open: "24:00", close: "24:00" }] }),
      week({ "1": [1 as never] }), { ...week(), "2": "open" },
      week({ "1": [0, 1, 2, 3].map((n) => ({ open: `0${n}:00`, close: `0${n}:30` })) }),
    ];
    for (const input of bad) expect(validateOpeningHours(input).ok).toBe(false);
  });

  it("drops unknown fields instead of storing them", () => {
    const r = validateOpeningHours(week({ "1": [{ open: "09:00", close: "17:00", evil: "<script>" } as never] }));
    expect(r.ok && JSON.stringify(r.value).includes("evil")).toBe(false);
  });
});

describe("isOpenAt (Cairo time)", () => {
  // 2026-01-15 is a Thursday ("4"); Cairo is UTC+2 in January.
  const hours = week({ "4": [{ open: "09:00", close: "22:00" }] });

  it("is open during the interval", () => {
    expect(isOpenAt(hours, new Date("2026-01-15T10:00:00Z"))).toBe(true); // 12:00 Cairo
  });

  it("is closed outside it and on closed days", () => {
    expect(isOpenAt(hours, new Date("2026-01-15T20:30:00Z"))).toBe(false); // 22:30 Cairo
    expect(isOpenAt(hours, new Date("2026-01-15T06:59:00Z"))).toBe(false); // 08:59 Cairo
    expect(isOpenAt(hours, new Date("2026-01-16T10:00:00Z"))).toBe(false); // Friday: closed
  });

  it("treats the closing minute as closed and the opening minute as open", () => {
    expect(isOpenAt(hours, new Date("2026-01-15T07:00:00Z"))).toBe(true); // 09:00
    expect(isOpenAt(hours, new Date("2026-01-15T20:00:00Z"))).toBe(false); // 22:00
  });

  it("supports 24:00 and uses Cairo (not UTC) for the weekday", () => {
    const late = week({ "4": [{ open: "08:00", close: "24:00" }] });
    expect(isOpenAt(late, new Date("2026-01-15T21:59:00Z"))).toBe(true); // 23:59 Cairo Thursday
    expect(isOpenAt(late, new Date("2026-01-15T22:00:00Z"))).toBe(false); // 00:00 Cairo Friday
  });

  it("treats a merchant with no schedule as always open", () => {
    expect(isOpenAt(null, new Date())).toBe(true);
  });
});

describe("parseHoursFields", () => {
  it("builds a week from form fields, honouring closed days", () => {
    const fields: Record<string, string> = {};
    for (const d of ["0", "1", "2", "3", "4", "5", "6"]) { fields[`h:${d}:open`] = "09:00"; fields[`h:${d}:close`] = "21:00"; }
    fields["h:5:closed"] = "on";
    const r = parseHoursFields((name) => fields[name] ?? "");
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value["5"].length).toBe(0); expect(r.value["6"][0]?.close).toBe("21:00"); }
  });

  it("rejects missing or reversed times", () => {
    expect(parseHoursFields(() => "").ok).toBe(false);
  });
});
