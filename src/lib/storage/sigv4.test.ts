import { describe, expect, it } from "vitest";
import { amzDateFor, sha256Hex, signSigV4 } from "./sigv4";

describe("SigV4", () => {
  it("reproduces the AWS documentation example signature (GET Object with Range)", () => {
    const headers = signSigV4({
      method: "GET",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      headers: { range: "bytes=0-9" },
      payloadHash: sha256Hex(""),
      amzDate: "20130524T000000Z",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      service: "s3",
    });
    expect(headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
    expect(headers.host).toBeUndefined();
  });

  it("formats the date for the signature", () => {
    expect(amzDateFor(new Date("2026-10-31T17:05:09.123Z"))).toBe("20261031T170509Z");
  });
});
