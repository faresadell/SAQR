import { describe, expect, it } from "vitest";
import { distanceKm, estimateEtaMinutes } from "./geo";

describe("geo", () => {
  const tahrir = { lat: 30.0444, lng: 31.2357 };
  const giza = { lat: 30.0131, lng: 31.2089 };
  it("measures the straight-line distance", () => {
    expect(distanceKm(tahrir, tahrir)).toBe(0);
    expect(distanceKm(tahrir, giza)).toBeGreaterThan(3.5);
    expect(distanceKm(tahrir, giza)).toBeLessThan(5);
  });
  it("estimates minutes, at least one, growing with distance", () => {
    expect(estimateEtaMinutes(tahrir, tahrir)).toBe(1);
    const near = estimateEtaMinutes(tahrir, giza);
    expect(near).toBeGreaterThanOrEqual(10);
    expect(near).toBeLessThanOrEqual(20);
    expect(estimateEtaMinutes(tahrir, { lat: 31.2, lng: 29.9 })).toBeGreaterThan(near);
  });
});
