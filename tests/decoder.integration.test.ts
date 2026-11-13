import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { convertHeic, detectHeic, getHeicInfo, ResourceLimitError } from "../src";

const fixture = await readFile(new URL("./fixtures/pattern.heic", import.meta.url));

describe("real HEIC conversion", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "does not darken premultiplied alpha when encoding %s",
    async (format) => {
      const input = await readFile(new URL("./fixtures/premultiplied-alpha.heic", import.meta.url));
      const result = await convertHeic(input, { format, quality: 1 });
      if (!(result.data instanceof Uint8Array)) throw new Error("Expected Node.js output bytes.");
      const { data, info } = await sharp(result.data)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info).toMatchObject({ width: 32, height: 32, channels: 4 });
      // JPEG composites onto black; PNG/WebP must retain straight RGB and alpha.
      const expected = format === "jpeg" ? [100, 50, 25, 255] : [199, 100, 50, 128];
      for (let channel = 0; channel < 4; channel++) {
        expect(Math.abs(data[channel] - expected[channel])).toBeLessThanOrEqual(2);
      }
    },
  );

  it("applies HEIF rotation and preserves non-opaque alpha on a non-square image", async () => {
    const input = await readFile(new URL("./fixtures/oriented-alpha.heic", import.meta.url));
    await expect(getHeicInfo(input, { inspectAlpha: true })).resolves.toMatchObject({
      width: 24,
      height: 40,
      imagesCount: 1,
      hasAlpha: true,
    });
    const result = await convertHeic(input, { format: "png" });
    if (!(result.data instanceof Uint8Array)) throw new Error("Expected Node.js output bytes.");
    const { data, info } = await sharp(result.data)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 24, height: 40, channels: 4 });
    for (const x of [10, 30]) {
      for (const y of [6, 18]) {
        // HEIF stores a clockwise 90-degree rotation: (x,y) -> (23-y,x).
        const offset = (x * info.width + 23 - y) * 4;
        const expected = [x < 20 ? 220 : 40, y < 12 ? 180 : 60, 100, x < 20 ? 255 : 96];
        for (let channel = 0; channel < 4; channel++) {
          expect(Math.abs(data[offset + channel] - expected[channel])).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it.each(["jpeg", "png", "webp"] as const)("encodes a readable %s image", async (format) => {
    const input = Buffer.from(fixture);
    const result = await convertHeic(input, { format, quality: 0.9 });

    expect(result.format).toBe(format);
    expect(result.mimeType).toBe(`image/${format}`);
    expect(result.data).toBeInstanceOf(Uint8Array);
    if (!(result.data instanceof Uint8Array)) {
      throw new Error("Expected Node.js conversion to return Uint8Array data.");
    }
    const image = sharp(result.data);
    await expect(image.metadata()).resolves.toMatchObject({ format, width: 32, height: 32 });

    // Force a full decode: metadata alone also succeeds for some truncated images.
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 32, height: 32, channels: 4 });
    expect(data.byteLength).toBe(32 * 32 * 4);
    for (const y of [8, 24]) {
      for (const x of [8, 24]) {
        const offset = (y * 32 + x) * 4;
        const expected = [x < 16 ? 220 : 40, y < 16 ? 180 : 60, 100];
        for (let channel = 0; channel < 3; channel++) {
          expect(
            Math.abs(data[offset + channel] - expected[channel]),
            `${format} pixel (${x}, ${y}), channel ${channel}`,
          ).toBeLessThanOrEqual(12);
        }
        expect(data[offset + 3]).toBe(255);
      }
    }
    expect(input).toEqual(fixture);
  });
});

describe("real HEIC decoding", () => {
  it("keeps valid dimensions when optional transparency inspection cannot decode pixels", async () => {
    const input = await readFile(new URL("./fixtures/oriented-alpha.heic", import.meta.url));
    for (let offset = 0; offset + 8 <= input.length; ) {
      const size = input.readUInt32BE(offset);
      if (input.toString("ascii", offset + 4, offset + 8) === "mdat") {
        input.fill(0, offset + 8, offset + size);
        break;
      }
      if (size < 8) throw new Error("Unexpected fixture box size.");
      offset += size;
    }
    const metadata = await getHeicInfo(input);
    expect(metadata).toMatchObject({ width: 24, height: 40, imagesCount: 1 });
    await expect(getHeicInfo(input, { inspectAlpha: true })).resolves.toEqual(metadata);
  });

  it("returns basic metadata without inspecting transparency by default", async () => {
    const info = await getHeicInfo(fixture);

    expect(info).toMatchObject({ width: 32, height: 32, imagesCount: 1 });
    expect(info).not.toHaveProperty("hasAlpha");
  });

  it.each([
    ["conversion", convertHeic],
    ["metadata inspection", getHeicInfo],
  ] as const)("enforces limits during %s and succeeds at the exact limits", async (_name, run) => {
    await expect(run(fixture, { maxPixels: 32 * 32 - 1 })).rejects.toBeInstanceOf(
      ResourceLimitError,
    );
    await expect(run(fixture, { maxInputBytes: fixture.byteLength - 1 })).rejects.toBeInstanceOf(
      ResourceLimitError,
    );
    await expect(
      run(fixture, { maxPixels: 32 * 32, maxInputBytes: fixture.byteLength }),
    ).resolves.toBeDefined();
  });

  it.each([
    { name: "the original header", majorBrand: undefined, extended: false },
    { name: "a compatible HEVC brand", majorBrand: "isom", extended: false },
    { name: "an extended-size ftyp", majorBrand: "heic", extended: true },
    {
      name: "an extended-size ftyp with a compatible HEVC brand",
      majorBrand: "isom",
      extended: true,
    },
    { name: "the heim major brand", majorBrand: "heim", extended: false },
    { name: "the heis major brand", majorBrand: "heis", extended: false },
  ])("converts and inspects $name", async ({ majorBrand, extended }) => {
    const input = withFtypHeader(majorBrand, extended);
    const snapshot = Buffer.from(input);

    await expect(detectHeic(input)).resolves.toMatchObject({ isHeic: true, codec: "hevc" });

    const result = await convertHeic(input, { format: "jpeg", quality: 0.9 });

    expect(result.format).toBe("jpeg");
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.data).toBeInstanceOf(Uint8Array);
    if (!(result.data instanceof Uint8Array)) {
      throw new Error("Expected Node.js conversion to return Uint8Array data.");
    }
    await expect(sharp(result.data).metadata()).resolves.toMatchObject({
      format: "jpeg",
      width: 32,
      height: 32,
    });
    await expect(getHeicInfo(input, { inspectAlpha: true })).resolves.toMatchObject({
      width: 32,
      height: 32,
      hasAlpha: false,
    });
    expect(input).toEqual(snapshot);
  });
});

function withFtypHeader(majorBrand: string | undefined, extended: boolean): Buffer {
  const bytes = Buffer.from(fixture);
  if (!majorBrand) {
    return bytes;
  }

  const boxSize = bytes.readUInt32BE(0);
  const headerSize = extended ? 16 : 8;
  if (boxSize < headerSize + 12) {
    throw new Error("The fixture needs space for a major and a compatible brand.");
  }

  // Keep the box length unchanged so absolute item offsets remain valid.
  bytes.fill(0, 8, boxSize);
  bytes.writeUInt32BE(extended ? 1 : boxSize, 0);
  if (extended) {
    bytes.writeBigUInt64BE(BigInt(boxSize), 8);
  }
  bytes.write(majorBrand, headerSize, "ascii");
  const compatibleBrand = majorBrand === "heim" || majorBrand === "heis" ? "mif1" : "heic";
  for (let offset = headerSize + 8; offset + 4 <= boxSize; offset += 4) {
    bytes.write(compatibleBrand, offset, "ascii");
  }

  return bytes;
}
