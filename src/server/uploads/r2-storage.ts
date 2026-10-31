import { amzDateFor, sha256Hex, signSigV4 } from "@/lib/storage/sigv4";
import { STORAGE_KEY_PATTERN } from "@/lib/uploads/image-sniff";
import type { PrivateStorage } from "./storage";

export interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body?: Uint8Array; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

/**
 * Cloudflare R2 through its S3-compatible API. The bucket must stay PRIVATE (no public bucket URL / custom domain):
 * every read goes through our own routes, which check who may see the file.
 */
export class R2Storage implements PrivateStorage {
  constructor(
    private readonly config: R2Config,
    private readonly fetchFn: FetchFn = (url, init) => fetch(url, init as RequestInit),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async call(method: "PUT" | "GET", key: string, body?: Uint8Array) {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
    const host = `${this.config.accountId}.r2.cloudflarestorage.com`;
    const path = `/${this.config.bucket}/${key}`; // key characters are limited by STORAGE_KEY_PATTERN, so no encoding is needed
    const headers = signSigV4({
      method,
      host,
      path,
      payloadHash: sha256Hex(body ?? ""),
      amzDate: amzDateFor(this.now()),
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: "auto",
      service: "s3",
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      return await this.fetchFn(`https://${host}${path}`, { method, headers, body, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const response = await this.call("PUT", key, bytes);
    if (!response.ok) throw new Error(`R2 put failed (${response.status})`);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const response = await this.call("GET", key);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`R2 get failed (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
