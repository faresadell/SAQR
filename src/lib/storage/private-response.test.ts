import { describe, expect, it } from "vitest";
import { privateImageResponse } from "./private-response";

describe("privateImageResponse", () => {
  it("serves the bytes as an inert, uncacheable image", async () => {
    const res = privateImageResponse(Uint8Array.from([1, 2, 3]), "image/png");
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(res.headers.get("Content-Length")).toBe("3");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(Uint8Array.from([1, 2, 3]));
  });
});
