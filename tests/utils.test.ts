import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InvalidInputError } from "../src";
import { assertNonEmptyInput, normalizeInput } from "../src/utils/input";
import {
  getHeicExtension,
  getHeicExtensionFromMimeType,
  getHeicMimeType,
  getOutputMimeType,
  normalizeQuality,
} from "../src/utils/mime";

describe("input utilities", () => {
  it("rejects missing and unknown input", async () => {
    await expect(normalizeInput(null as never)).rejects.toBeInstanceOf(InvalidInputError);
    await expect(normalizeInput({} as never)).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("normalizes ArrayBuffer input", async () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;

    await expect(normalizeInput(buffer)).resolves.toEqual({ bytes: new Uint8Array([1, 2, 3]) });
  });

  it("normalizes Node.js file path input", async () => {
    const directory = await mkdtemp(join(tmpdir(), "heicraft-input-"));
    const filePath = join(directory, "photo.heic");

    try {
      await writeFile(filePath, new Uint8Array([1, 2, 3]));

      await expect(normalizeInput(filePath)).resolves.toEqual({
        bytes: new Uint8Array([1, 2, 3]),
        filename: "photo.heic",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects empty Node.js file paths and empty bytes", async () => {
    await expect(normalizeInput(" ")).rejects.toBeInstanceOf(InvalidInputError);
    expect(() => assertNonEmptyInput(new Uint8Array())).toThrow(InvalidInputError);
  });
});

describe("MIME utilities", () => {
  it("maps output MIME types", () => {
    expect(getOutputMimeType("jpeg")).toBe("image/jpeg");
    expect(getOutputMimeType("png")).toBe("image/png");
    expect(getOutputMimeType("webp")).toBe("image/webp");
  });

  it("maps HEIC/HEIF brands and extensions", () => {
    expect(getHeicMimeType("hevc")).toBe("image/heic");
    expect(getHeicMimeType("msf1")).toBe("image/heif");
    expect(getHeicMimeType(undefined, "heic")).toBe("image/heic");
    expect(getHeicMimeType(undefined, "heif")).toBe("image/heif");
    expect(getHeicMimeType("avif")).toBeUndefined();
  });

  it("extracts HEIC/HEIF extensions and MIME fallbacks", () => {
    expect(getHeicExtension("PHOTO.HEIC")).toBe("heic");
    expect(getHeicExtension("photo.heif")).toBe("heif");
    expect(getHeicExtension("photo.jpg")).toBeUndefined();
    expect(getHeicExtension()).toBeUndefined();
    expect(getHeicExtensionFromMimeType("image/heic")).toBe("heic");
    expect(getHeicExtensionFromMimeType("image/heif")).toBe("heif");
    expect(getHeicExtensionFromMimeType("image/jpeg")).toBeUndefined();
  });

  it("normalizes quality for encoders", () => {
    expect(normalizeQuality(0.925)).toBe(93);
  });
});
