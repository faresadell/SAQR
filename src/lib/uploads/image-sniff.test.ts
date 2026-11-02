import { describe, expect, it } from "vitest";
import { detectImage, STORAGE_KEY_PATTERN } from "./image-sniff";

const pad = (head: number[]) => Uint8Array.from([...head, ...new Array(32).fill(0)]);

describe("detectImage", () => {
  it("recognises JPEG, PNG and WebP by content", () => {
    expect(detectImage(pad([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(detectImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
    const webp = pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImage(webp)?.contentType).toBe("image/webp");
  });
  it("rejects executables, scripts, html, pdf and tiny files whatever their name says", () => {
    expect(detectImage(pad([0x4d, 0x5a]))).toBeNull(); // Windows exe
    expect(detectImage(pad([0x7f, 0x45, 0x4c, 0x46]))).toBeNull(); // ELF
    expect(detectImage(new TextEncoder().encode("<script>alert(1)</script>........"))).toBeNull();
    expect(detectImage(new TextEncoder().encode("%PDF-1.7 ............"))).toBeNull();
    expect(detectImage(Uint8Array.from([0xff, 0xd8, 0xff]))).toBeNull();
    expect(detectImage(pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull(); // RIFF/WAVE
  });
});

describe("storage key pattern", () => {
  it("accepts server-made keys and refuses traversal", () => {
    expect(STORAGE_KEY_PATTERN.test("receipts/clabcdefgh123/123e4567-e89b-12d3-a456-426614174000.jpg")).toBe(true);
    expect(STORAGE_KEY_PATTERN.test("receipts/../../etc/passwd")).toBe(false);
    expect(STORAGE_KEY_PATTERN.test("receipts/clabcdefgh123/../x.jpg")).toBe(false);
    expect(STORAGE_KEY_PATTERN.test("/receipts/clabcdefgh123/123e4567-e89b-12d3-a456-426614174000.jpg")).toBe(false);
  });
});
