import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectHeic, isHeic, ResourceLimitError } from "../src";
import { CountingBlob, createFtypBytes } from "./helpers";

describe("detectHeic", () => {
  it("detects valid HEIC from the ftyp major brand", async () => {
    const result = await detectHeic(createFtypBytes("heic"));

    expect(result).toEqual({
      isHeic: true,
      isHeif: true,
      codec: "hevc",
      brand: "heic",
      mimeType: "image/heic",
      extension: undefined,
    });
  });

  it.each(["mif1", "msf1"])(
    "distinguishes a %s container from a confirmed HEVC signature",
    async (brand) => {
      const result = await detectHeic(createFtypBytes("isom", [brand]));

      expect(result.isHeic).toBe(false);
      expect(result.isHeif).toBe(true);
      expect(result.codec).toBeUndefined();
      expect(result.brand).toBe(brand);
      expect(result.mimeType).toBe("image/heif");
    },
  );

  it("prioritizes HEVC brands over generic container brands", async () => {
    await expect(detectHeic(createFtypBytes("mif1", ["msf1", "heic"]))).resolves.toMatchObject({
      isHeic: true,
      isHeif: true,
      codec: "hevc",
      brand: "heic",
      mimeType: "image/heic",
    });
  });

  it.each([
    ["avif", ["mif1"]],
    ["avis", ["msf1", "mif1"]],
    ["mif1", ["avif"]],
    ["mif1", ["heic", "avif"]],
  ] as const)("does not identify AV1 as HEIC (%s, %j)", async (majorBrand, compatibleBrands) => {
    const file = new File([createFtypBytes(majorBrand, [...compatibleBrands])], "photo.heic", {
      type: "image/heic",
    });

    await expect(isHeic(file)).resolves.toBe(false);
    await expect(detectHeic(file)).resolves.toMatchObject({
      isHeic: false,
      isHeif: true,
      codec: "av1",
      brand: majorBrand === "avis" ? "avis" : "avif",
      mimeType: undefined,
      extension: "heic",
    });
  });

  it.each([
    ["empty", new Uint8Array()],
    ["JPEG", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46])],
    ["unrelated ISO BMFF", createFtypBytes("isom")],
    ["truncated HEIC", createFtypBytes("heic").subarray(0, 12)],
  ])("rejects %s files despite HEIC filename and MIME hints", async (_label, bytes) => {
    const file = new File([bytes], "photo.heic", { type: "image/heic" });

    await expect(isHeic(file)).resolves.toBe(false);
    await expect(detectHeic(file)).resolves.toMatchObject({
      isHeic: false,
      isHeif: false,
      codec: undefined,
      brand: undefined,
      mimeType: undefined,
      extension: "heic",
    });
  });

  it("prioritizes HEIC bytes over conflicting filename and MIME hints", async () => {
    const file = new File([createFtypBytes("heic")], "photo.jpg", { type: "image/jpeg" });

    await expect(detectHeic(file)).resolves.toMatchObject({
      isHeic: true,
      isHeif: true,
      codec: "hevc",
      brand: "heic",
      mimeType: "image/heic",
      extension: undefined,
    });
  });

  it("returns false for invalid files", async () => {
    await expect(isHeic(new Uint8Array([1, 2, 3, 4]))).resolves.toBe(false);
    await expect(detectHeic(new Uint8Array([1, 2, 3, 4]))).resolves.toEqual({
      isHeic: false,
      isHeif: false,
      codec: undefined,
      brand: undefined,
      mimeType: undefined,
      extension: undefined,
    });
  });

  it("returns false when input normalization fails", async () => {
    await expect(isHeic(null as never)).resolves.toBe(false);
  });

  it("applies byte limits to both detection APIs before reading", async () => {
    const blob = new CountingBlob([createFtypBytes("heic")]);
    const options = { maxInputBytes: blob.size - 1 };

    await expect(detectHeic(blob, options)).rejects.toBeInstanceOf(ResourceLimitError);
    await expect(isHeic(blob, options)).resolves.toBe(false);
    expect(blob.reads).toBe(0);

    await expect(isHeic(blob, { maxInputBytes: blob.size })).resolves.toBe(true);
  });

  it("rejects malformed ftyp boxes instead of scanning past the box", async () => {
    const bytes = createFtypBytes("isom", ["heic"]);
    bytes[3] = 8;

    await expect(detectHeic(bytes)).resolves.toMatchObject({
      isHeic: false,
      brand: undefined,
    });
  });

  it("rejects truncated ftyp boxes", async () => {
    const bytes = createFtypBytes("heic");
    bytes[3] = bytes.byteLength + 4;

    await expect(detectHeic(bytes)).resolves.toMatchObject({
      isHeic: false,
      brand: undefined,
    });
  });

  it("rejects ftyp boxes with incomplete compatible brands despite metadata hints", async () => {
    const bytes = new Uint8Array(17);
    bytes.set(createFtypBytes("heic"));
    bytes[3] = bytes.byteLength;
    const file = new File([bytes], "photo.heic", { type: "image/heic" });

    await expect(detectHeic(file)).resolves.toMatchObject({
      isHeic: false,
      isHeif: false,
      brand: undefined,
    });
  });

  it("supports extended-size ftyp boxes", async () => {
    const regularBox = createFtypBytes("heix");
    const bytes = new Uint8Array(regularBox.byteLength + 8);
    bytes.set([0, 0, 0, 1], 0);
    bytes.set(regularBox.subarray(4, 8), 4);
    bytes.set([0, 0, 0, 0, 0, 0, 0, bytes.byteLength], 8);
    bytes.set(regularBox.subarray(8), 16);

    await expect(detectHeic(bytes)).resolves.toMatchObject({
      isHeic: true,
      brand: "heix",
      mimeType: "image/heic",
    });
  });

  it("supports an ftyp box whose zero size extends to EOF", async () => {
    const bytes = createFtypBytes("heic");
    bytes.fill(0, 0, 4);

    await expect(detectHeic(bytes)).resolves.toMatchObject({
      isHeic: true,
      brand: "heic",
      mimeType: "image/heic",
    });
  });

  it("keeps MIME metadata only as an extension hint", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/heic" });
    const result = await detectHeic(blob);

    expect(result.isHeic).toBe(false);
    expect(result.extension).toBe("heic");
    expect(result.mimeType).toBeUndefined();
  });

  it("keeps Node.js file path extensions only as hints", async () => {
    const directory = await mkdtemp(join(tmpdir(), "heicraft-"));
    const filePath = join(directory, "photo.heif");

    try {
      await writeFile(filePath, new Uint8Array([1, 2, 3]));
      const result = await detectHeic(filePath);

      expect(result.isHeic).toBe(false);
      expect(result.extension).toBe("heif");
      expect(result.mimeType).toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("supports Buffer-compatible input", async () => {
    const bytes = Buffer.from(createFtypBytes("heix"));

    await expect(isHeic(bytes)).resolves.toBe(true);
  });
});
