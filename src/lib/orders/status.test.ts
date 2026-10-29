import { describe, expect, it } from "vitest";
import { allowedTransitions, canTransition, deriveParentStatus, isTerminal, starsEffectOf, type OrderStatusName } from "./status";

describe("suborder transitions", () => {
  it("allows the happy path", () => {
    const path: OrderStatusName[] = ["AWAITING_PAYMENT", "AWAITING_MERCHANT_APPROVAL", "APPROVED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
  });
  it("blocks skipping steps and leaving terminal states", () => {
    expect(canTransition("AWAITING_PAYMENT", "DELIVERED")).toBe(false);
    expect(canTransition("APPROVED", "AWAITING_PAYMENT")).toBe(false);
    for (const t of ["DELIVERED", "CANCELLED", "REJECTED"] as const) {
      expect(isTerminal(t)).toBe(true);
      expect(allowedTransitions(t).length).toBe(0);
    }
  });
  it("only a not-yet-approved order can be rejected", () => {
    expect(canTransition("AWAITING_MERCHANT_APPROVAL", "REJECTED")).toBe(true);
    expect(canTransition("APPROVED", "REJECTED")).toBe(false);
  });
});

describe("deriveParentStatus", () => {
  it("is derived from the children", () => {
    expect(deriveParentStatus(["AWAITING_PAYMENT", "AWAITING_MERCHANT_APPROVAL"])).toBe("PENDING");
    expect(deriveParentStatus(["PREPARING", "AWAITING_PAYMENT"])).toBe("IN_PROGRESS");
    expect(deriveParentStatus(["DELIVERED", "PREPARING"])).toBe("IN_PROGRESS");
    expect(deriveParentStatus(["DELIVERED", "DELIVERED"])).toBe("COMPLETED");
    expect(deriveParentStatus(["CANCELLED", "REJECTED"])).toBe("CANCELLED");
    expect(deriveParentStatus(["DELIVERED", "CANCELLED"])).toBe("PARTIALLY_COMPLETED");
    expect(deriveParentStatus(["CANCELLED", "AWAITING_PAYMENT"])).toBe("PENDING");
  });
  it("refuses an empty parent", () => {
    expect(() => deriveParentStatus([])).toThrow();
  });
});

describe("starsEffectOf", () => {
  it("charges once on approval and refunds once on cancellation after charge", () => {
    expect(starsEffectOf("AWAITING_MERCHANT_APPROVAL", "APPROVED", false, false).kind).toBe("CHARGE");
    expect(starsEffectOf("AWAITING_MERCHANT_APPROVAL", "APPROVED", true, false).kind).toBe("NONE");
    expect(starsEffectOf("APPROVED", "CANCELLED", true, false).kind).toBe("REFUND");
    expect(starsEffectOf("APPROVED", "CANCELLED", true, true).kind).toBe("NONE");
  });
  it("never refunds an order that was never charged", () => {
    expect(starsEffectOf("AWAITING_PAYMENT", "CANCELLED", false, false).kind).toBe("NONE");
    expect(starsEffectOf("AWAITING_MERCHANT_APPROVAL", "REJECTED", false, false).kind).toBe("NONE");
  });
});
