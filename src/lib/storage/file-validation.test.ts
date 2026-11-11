import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, sniffImageMime, validateImageUpload } from "./file-validation";

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const bytesOf = (text: string) => new TextEncoder().encode(text);

describe("sniffImageMime", () => {
  it("recognises JPEG, PNG and WebP from their signatures", () => {
    expect(sniffImageMime(jpeg)).toBe("image/jpeg");
    expect(sniffImageMime(png)).toBe("image/png");
    expect(sniffImageMime(webp)).toBe("image/webp");
  });

  it("refuses SVG, HTML, PDF, GIF and random bytes", () => {
    expect(sniffImageMime(bytesOf("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toBeNull();
    expect(sniffImageMime(bytesOf("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImageMime(bytesOf("%PDF-1.7"))).toBeNull();
    expect(sniffImageMime(bytesOf("GIF89a....."))).toBeNull();
    expect(sniffImageMime(Uint8Array.from([1, 2, 3]))).toBeNull();
  });

  it("does not mistake a RIFF file that is not WebP (e.g. WAV)", () => {
    const wav = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]);
    expect(sniffImageMime(wav)).toBeNull();
  });
});

describe("validateImageUpload", () => {
  it("accepts a real image and reports its true type and extension", () => {
    expect(validateImageUpload(png, "image/png")).toEqual({ ok: true, mime: "image/png", extension: "png", size: png.length });
    expect(validateImageUpload(jpeg, "image/jpg")).toMatchObject({ ok: true, mime: "image/jpeg", extension: "jpg" });
    expect(validateImageUpload(webp)).toMatchObject({ ok: true, mime: "image/webp" });
  });

  it("rejects empty and oversized files", () => {
    expect(validateImageUpload(new Uint8Array(0))).toEqual({ ok: false, error: "EMPTY" });
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(png);
    expect(validateImageUpload(big)).toEqual({ ok: false, error: "TOO_LARGE" });
    const limit = new Uint8Array(MAX_IMAGE_BYTES);
    limit.set(png);
    expect(validateImageUpload(limit).ok).toBe(true);
  });

  it("rejects a script disguised as an image, whatever the browser claims", () => {
    expect(validateImageUpload(bytesOf("<script>alert(1)</script>"), "image/png")).toEqual({ ok: false, error: "UNSUPPORTED_TYPE" });
    expect(validateImageUpload(bytesOf("<svg onload=alert(1)>"), "image/svg+xml")).toEqual({ ok: false, error: "UNSUPPORTED_TYPE" });
  });

  it("rejects a mislabelled file instead of trusting the declared type", () => {
    expect(validateImageUpload(png, "image/jpeg")).toEqual({ ok: false, error: "TYPE_MISMATCH" });
    expect(validateImageUpload(jpeg, "text/html")).toEqual({ ok: false, error: "TYPE_MISMATCH" });
  });
});
