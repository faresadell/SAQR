import { describe, expect, it } from "vitest";
import { applyMerchantAction, type MerchantAction, type MerchantStatusName } from "./merchant-status";

describe("merchant status machine", () => {
  it("follows the legal paths", () => {
    const go = (s: MerchantStatusName, a: MerchantAction, reason?: string) => applyMerchantAction(s, a, reason);
    const approve = go("PENDING_REVIEW", "APPROVE");
    expect(approve.ok && approve.next === "APPROVED").toBe(true);
    const reject = go("PENDING_REVIEW", "REJECT", "الأوراق ناقصة");
    expect(reject.ok && reject.next === "REJECTED").toBe(true);
    const resubmit = go("REJECTED", "RESUBMIT");
    expect(resubmit.ok && resubmit.next === "PENDING_REVIEW").toBe(true);
    const suspend = go("APPROVED", "SUSPEND", "شكاوى متكررة");
    expect(suspend.ok && suspend.next === "SUSPENDED").toBe(true);
    const back = go("SUSPENDED", "REACTIVATE");
    expect(back.ok && back.next === "APPROVED").toBe(true);
  });

  it("requires a reason to reject or suspend", () => {
    for (const [s, a] of [["PENDING_REVIEW", "REJECT"], ["APPROVED", "SUSPEND"]] as const) {
      const r = applyMerchantAction(s, a, " ");
      expect(!r.ok && r.error === "REASON_REQUIRED").toBe(true);
    }
  });

  it("refuses every illegal move", () => {
    const illegal: [MerchantStatusName, MerchantAction][] = [
      ["APPROVED", "APPROVE"], ["REJECTED", "APPROVE"], ["SUSPENDED", "APPROVE"], ["APPROVED", "REJECT"],
      ["PENDING_REVIEW", "SUSPEND"], ["REJECTED", "SUSPEND"], ["PENDING_REVIEW", "REACTIVATE"], ["APPROVED", "REACTIVATE"],
      ["APPROVED", "RESUBMIT"], ["SUSPENDED", "RESUBMIT"], ["PENDING_REVIEW", "RESUBMIT"],
    ];
    for (const [s, a] of illegal) {
      const r = applyMerchantAction(s, a, "سبب واضح");
      expect(!r.ok && r.error === "INVALID_TRANSITION").toBe(true);
    }
  });
});
