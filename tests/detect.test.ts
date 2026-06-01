import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectHeic, isHeic } from "../src";
import { createFtypBytes } from "./helpers";

describe("detectHeic", () => {
  it("detects valid HEIC from the ftyp major brand", async () => {
    const result = await detectHeic(createFtypBytes("heic"));

    expect(result).toEqual({
      isHeic: true,
      brand: "heic",
      mimeType: "image/heic",
      extension: undefined,
    });
  });

  it("detects valid HEIF from a compatible brand", async () => {
    const result = await detectHeic(createFtypBytes("isom", ["mif1"]));

    expect(result.isHeic).toBe(true);
    expect(result.brand).toBe("mif1");
    expect(result.mimeType).toBe("image/heif");
  });

  it("returns false for invalid files", async () => {
    await expect(isHeic(new Uint8Array([1, 2, 3, 4]))).resolves.toBe(false);
    await expect(detectHeic(new Uint8Array([1, 2, 3, 4]))).resolves.toEqual({
      isHeic: false,
      brand: undefined,
      mimeType: undefined,
      extension: undefined,
    });
  });

  it("rejects malformed ftyp boxes instead of scanning past the box", async () => {
    const bytes = createFtypBytes("isom", ["heic"]);
    bytes[3] = 8;

    await expect(detectHeic(bytes)).resolves.toMatchObject({
      isHeic: false,
      brand: undefined,
    });
  });

  it("uses MIME fallback when signature data is inconclusive", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/heic" });
    const result = await detectHeic(blob);

    expect(result.isHeic).toBe(true);
    expect(result.extension).toBe("heic");
    expect(result.mimeType).toBe("image/heic");
  });

  it("uses extension fallback for Node.js file paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "heicraft-"));
    const filePath = join(directory, "photo.heif");

    try {
      await writeFile(filePath, new Uint8Array([1, 2, 3]));
      const result = await detectHeic(filePath);

      expect(result.isHeic).toBe(true);
      expect(result.extension).toBe("heif");
      expect(result.mimeType).toBe("image/heif");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("supports Buffer-compatible input", async () => {
    const bytes = Buffer.from(createFtypBytes("heix"));

    await expect(isHeic(bytes)).resolves.toBe(true);
  });
});
