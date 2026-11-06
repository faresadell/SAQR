import { describe, expect, it } from "vitest";
import { MAX_AVATAR_BYTES, parseAvatarDataUrl } from "./avatar-data";

const jpeg = (n: number) => {
  const bytes = new Uint8Array(n).fill(1);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return "data:image/jpeg;base64," + Buffer.from(bytes).toString("base64");
};

describe("parseAvatarDataUrl", () => {
  it("accepts a small JPEG", () => {
    expect(parseAvatarDataUrl(jpeg(2000))?.length).toBe(2000);
  });
  it("refuses other types, bad base64, wrong signature and oversize", () => {
    expect(parseAvatarDataUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(parseAvatarDataUrl("data:image/jpeg;base64,@@@@")).toBeNull();
    expect(parseAvatarDataUrl("data:image/jpeg;base64," + Buffer.from("hello world").toString("base64"))).toBeNull();
    expect(parseAvatarDataUrl(jpeg(MAX_AVATAR_BYTES + 10))).toBeNull();
    expect(parseAvatarDataUrl("")).toBeNull();
  });
});
