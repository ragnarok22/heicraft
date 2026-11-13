import type { DecodedImage, OutputFormat } from "../types";
import { normalizeQuality } from "../utils/mime";

export async function encodeInNode(
  decoded: DecodedImage,
  format: OutputFormat,
  quality: number,
): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  const { buffer, byteOffset, byteLength } = decoded.data;
  const image = sharp(Buffer.from(buffer, byteOffset, byteLength), {
    raw: { width: decoded.width, height: decoded.height, channels: 4 },
  });
  const output =
    format === "jpeg"
      ? await image.jpeg({ quality: normalizeQuality(quality) }).toBuffer()
      : format === "webp"
        ? await image.webp({ quality: normalizeQuality(quality) }).toBuffer()
        : await image.png().toBuffer();
  return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
}
