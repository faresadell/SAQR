import { createHash, createHmac } from "node:crypto";

// AWS Signature Version 4 (header-based). Used for Cloudflare R2 (S3-compatible, region "auto", service "s3").
// Pure functions: verified in unit tests against the AWS documentation example.
export interface SigV4Input {
  method: string;
  host: string;
  path: string; // already URI-encoded, starts with "/"
  query?: string; // canonical query string, "" when none
  headers?: Record<string, string>; // extra headers to sign (lowercase names)
  payloadHash: string; // hex sha256 of the body
  amzDate: string; // YYYYMMDDTHHMMSSZ
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

export function amzDateFor(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Returns the headers to send (host is implied by the URL and also signed). */
export function signSigV4(input: SigV4Input): Record<string, string> {
  const day = input.amzDate.slice(0, 8);
  const signed: Record<string, string> = {
    ...(input.headers ?? {}),
    host: input.host,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": input.amzDate,
  };
  const names = Object.keys(signed).sort();
  const canonicalHeaders = names.map((n) => `${n}:${signed[n]!.trim().replace(/\s+/g, " ")}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [input.method, input.path, input.query ?? "", canonicalHeaders, signedHeaders, input.payloadHash].join("\n");
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", input.amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), input.service), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const { host: _host, ...sendable } = signed;
  void _host;
  return { ...sendable, authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}
