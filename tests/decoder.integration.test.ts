import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { convertHeic, detectHeic, getHeicInfo } from "../src";

const fixture = await readFile(new URL("./fixtures/pattern.heic", import.meta.url));

describe("real HEIC decoding", () => {
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
    await expect(getHeicInfo(input)).resolves.toMatchObject({
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
