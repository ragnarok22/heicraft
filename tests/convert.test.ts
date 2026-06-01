import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, test } from "vitest";
import { AbortError, ConversionError, convertHeic, InvalidInputError, UnsupportedFormatError } from "../src";
import { createFtypBytes } from "./helpers";

describe("convertHeic", () => {
  it("rejects invalid quality values", async () => {
    await expect(convertHeic(new Uint8Array([1]), { quality: -0.1 })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(convertHeic(new Uint8Array([1]), { quality: 1.1 })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(convertHeic(new Uint8Array([1]), { quality: Number.NaN })).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("rejects unsupported output formats", async () => {
    await expect(
      convertHeic(new Uint8Array([1]), { format: "gif" as never }),
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it("rejects empty input", async () => {
    await expect(convertHeic(new Uint8Array())).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("supports AbortSignal before conversion starts", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(convertHeic(createFtypBytes("heic"), { signal: controller.signal })).rejects.toBeInstanceOf(AbortError);
  });

  it("rejects non-HEIC input", async () => {
    await expect(convertHeic(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("wraps decoder failures in ConversionError", async () => {
    await expect(convertHeic(createFtypBytes("heic"))).rejects.toBeInstanceOf(ConversionError);
  });

  it("accepts Blob input for validation and detection", async () => {
    const blob = new Blob([createFtypBytes("heic")], { type: "image/heic" });

    await expect(convertHeic(blob)).rejects.toBeInstanceOf(ConversionError);
  });

  it("accepts Buffer-compatible input", async () => {
    const buffer = Buffer.from(createFtypBytes("heic"));

    await expect(convertHeic(buffer)).rejects.toBeInstanceOf(ConversionError);
  });
});

const fixtureUrl = new URL("./fixtures/photo.heic", import.meta.url);
const fixturePath = fileURLToPath(fixtureUrl);
const runFixtureTest = existsSync(fixturePath) ? test : test.skip;

runFixtureTest("converts a real HEIC fixture when tests/fixtures/photo.heic is present", async () => {
  const input = await readFile(fixturePath);
  const result = await convertHeic(input, { format: "jpeg", quality: 0.9 });

  expect(result.format).toBe("jpeg");
  expect(result.mimeType).toBe("image/jpeg");
  expect(result.data).toBeInstanceOf(Uint8Array);
  if (!(result.data instanceof Uint8Array)) {
    throw new Error("Expected Node.js conversion to return Uint8Array data.");
  }
  expect(result.data.byteLength).toBeGreaterThan(0);
});
