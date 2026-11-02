import { describe, expect, it } from "vitest";
import { R2Storage } from "./r2-storage";

const KEY = "receipts/abcdefgh12/123e4567-e89b-12d3-a456-426614174000.jpg";
const config = { accountId: "acc123", bucket: "saqr-private", accessKeyId: "AKID", secretAccessKey: "SECRET" };

describe("R2Storage", () => {
  it("signs PUT/GET to the private bucket endpoint and maps 404 to null", async () => {
    const calls: { url: string; method: string; headers: Record<string, string>; body?: Uint8Array }[] = [];
    const store = new R2Storage(
      config,
      async (url, init) => {
        calls.push({ url, method: init.method, headers: init.headers, body: init.body });
        return init.method === "GET" ? { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } : { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
      },
      () => new Date("2026-10-31T12:00:00Z"),
    );
    await store.put(KEY, Uint8Array.from([1, 2, 3]));
    expect(await store.get(KEY)).toBeNull();
    expect(calls[0]!.url).toBe(`https://acc123.r2.cloudflarestorage.com/saqr-private/${KEY}`);
    expect(calls[0]!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\/20261031\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(calls[0]!.headers["x-amz-date"]).toBe("20261031T120000Z");
    expect(JSON.stringify(calls)).not.toContain("SECRET");
  });

  it("rejects keys outside the allowed pattern and surfaces server errors", async () => {
    const store = new R2Storage(config, async () => ({ ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) }));
    await expect(store.put("../etc/passwd", new Uint8Array(1))).rejects.toThrow("Invalid storage key");
    await expect(store.put(KEY, new Uint8Array(1))).rejects.toThrow("R2 put failed (500)");
    await expect(store.get(KEY)).rejects.toThrow("R2 get failed (500)");
  });
});
