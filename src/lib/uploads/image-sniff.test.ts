import { describe, expect, it } from "vitest";
import { detectImage, STORAGE_KEY_PATTERN, stripImageMetadata } from "./image-sniff";

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
    for (const kind of ["product-images", "shop-images", "chat-images"]) expect(STORAGE_KEY_PATTERN.test(`${kind}/clabcdefgh123/123e4567-e89b-12d3-a456-426614174000.png`)).toBe(true); // every folder the server writes to
    expect(STORAGE_KEY_PATTERN.test("other-images/clabcdefgh123/123e4567-e89b-12d3-a456-426614174000.png")).toBe(false);
    expect(STORAGE_KEY_PATTERN.test("receipts/../../etc/passwd")).toBe(false);
    expect(STORAGE_KEY_PATTERN.test("receipts/clabcdefgh123/../x.jpg")).toBe(false);
    expect(STORAGE_KEY_PATTERN.test("/receipts/clabcdefgh123/123e4567-e89b-12d3-a456-426614174000.jpg")).toBe(false);
  });
});

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe("stripImageMetadata", () => {
  const jfif = seg(0xe0, text("JFIF\0"));
  const exif = seg(0xe1, text("Exif\0\0GPSLatitude=30.04"));
  const icc = seg(0xe2, text("ICC_PROFILE\0abc"));
  const comment = seg(0xfe, text("secret note"));
  const sos = [0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9];
  const jpeg = Uint8Array.from([0xff, 0xd8, ...jfif, ...exif, ...icc, ...comment, ...sos, ...new Array(8).fill(0)]);

  it("removes EXIF/XMP and comments but keeps the colour profile and the picture data", () => {
    const kind = detectImage(jpeg)!;
    const out = stripImageMetadata(jpeg, kind);
    const asText = Buffer.from(out).toString("latin1");
    expect(asText).not.toContain("GPSLatitude");
    expect(asText).not.toContain("secret note");
    expect(asText).toContain("ICC_PROFILE");
    expect(asText).toContain("JFIF");
    expect([...out.slice(0, 2)]).toEqual([0xff, 0xd8]);
    expect(out.length).toBe(jpeg.length - exif.length - comment.length);
    expect([...out.slice(-19)]).toEqual([...jpeg.slice(-19)]); // the scan and what follows are untouched
  });

  it("returns the original bytes when the structure is broken, and leaves PNG alone", () => {
    const broken = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(stripImageMetadata(broken, { contentType: "image/jpeg", ext: "jpg" })).toBe(broken);
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(12).fill(1)]);
    expect(stripImageMetadata(png, detectImage(png)!)).toBe(png);
  });
});
