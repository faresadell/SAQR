import { describe, expect, it } from "vitest";
import { parseEffectiveFrom, pickEffective } from "./effective";

const at = (iso: string) => new Date(iso);
const v = (value: number, from: string, created = from) => ({ value, effectiveFrom: at(from), createdAt: at(created) });

describe("pickEffective", () => {
  const versions = [v(800, "2026-01-01T00:00:00Z"), v(700, "2026-03-01T00:00:00Z")];

  it("keeps the old value until the new one's date", () => {
    expect(pickEffective(versions, at("2026-02-28T23:59:59Z"))?.value).toBe(800);
  });

  it("switches exactly at the effective date and stays switched", () => {
    expect(pickEffective(versions, at("2026-03-01T00:00:00Z"))?.value).toBe(700);
    expect(pickEffective(versions, at("2027-01-01T00:00:00Z"))?.value).toBe(700);
  });

  it("returns null when nothing is effective yet", () => {
    expect(pickEffective(versions, at("2025-12-31T00:00:00Z"))).toBeNull();
  });

  it("ignores list order", () => {
    const reversed = [...versions].reverse();
    expect(pickEffective(reversed, at("2026-06-01T00:00:00Z"))?.value).toBe(700);
  });

  it("lets a later row at the same start date correct an earlier one", () => {
    const corrected = [
      v(700, "2026-03-01T00:00:00Z", "2026-02-01T00:00:00Z"),
      v(650, "2026-03-01T00:00:00Z", "2026-02-10T00:00:00Z"),
    ];
    expect(pickEffective(corrected, at("2026-04-01T00:00:00Z"))?.value).toBe(650);
  });

  it("never lets a future change alter what an older moment resolves to", () => {
    const orderTime = at("2026-02-01T00:00:00Z");
    const before = pickEffective([v(800, "2026-01-01T00:00:00Z")], orderTime)?.value;
    const after = pickEffective(versions, orderTime)?.value;
    expect(after).toBe(before);
  });
});

describe("parseEffectiveFrom", () => {
  const now = at("2026-05-01T12:00:00Z");

  it("treats empty as now", () => {
    for (const empty of [undefined, null, "", "   "]) {
      const r = parseEffectiveFrom(empty, now);
      expect(r.ok && r.date.getTime() === now.getTime()).toBe(true);
    }
  });

  it("accepts future dates", () => {
    expect(parseEffectiveFrom("2026-06-01T00:00:00Z", now).ok).toBe(true);
  });

  it("refuses the past (no retroactive changes)", () => {
    const r = parseEffectiveFrom("2026-05-01T11:59:59Z", now);
    expect(!r.ok && r.error === "IN_PAST").toBe(true);
  });

  it("refuses invalid and too-far dates", () => {
    const bad = parseEffectiveFrom("not a date", now);
    expect(!bad.ok && bad.error === "INVALID_DATE").toBe(true);
    const far = parseEffectiveFrom("2030-01-01T00:00:00Z", now);
    expect(!far.ok && far.error === "TOO_FAR").toBe(true);
  });
});
