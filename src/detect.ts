import type { HeicDetectionResult, HeicInput, NormalizedInput } from "./types";
import { normalizeInput } from "./utils/input";
import { getHeicExtension, getHeicExtensionFromMimeType, getHeicMimeType } from "./utils/mime";

const heifBrands = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

export async function isHeic(input: HeicInput): Promise<boolean> {
  try {
    return (await detectHeic(input)).isHeic;
  } catch {
    return false;
  }
}

export async function detectHeic(input: HeicInput): Promise<HeicDetectionResult> {
  const normalized = await normalizeInput(input);

  return detectNormalizedHeic(normalized);
}

export function detectNormalizedHeic(normalized: NormalizedInput): HeicDetectionResult {
  const brand = detectHeifBrand(normalized.bytes);
  const extension =
    getHeicExtension(normalized.filename) ?? getHeicExtensionFromMimeType(normalized.mimeType);
  const mimeType = getHeicMimeType(brand, extension);

  return {
    isHeic: Boolean(
      brand ||
        extension ||
        normalized.mimeType === "image/heic" ||
        normalized.mimeType === "image/heif",
    ),
    brand,
    mimeType,
    extension,
  };
}

export function detectHeifBrand(bytes: Uint8Array): string | undefined {
  if (bytes.byteLength < 12 || readAscii(bytes, 4, 8) !== "ftyp") {
    return undefined;
  }

  const boxSize = readUint32(bytes, 0);
  const boxEnd = boxSize >= 12 ? Math.min(boxSize, bytes.byteLength) : bytes.byteLength;
  const brands: string[] = [readAscii(bytes, 8, 12)];

  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    brands.push(readAscii(bytes, offset, offset + 4));
  }

  return brands.find((brand) => heifBrands.has(brand));
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    (bytes[offset + 1] ?? 0) * 0x10000 +
    (bytes[offset + 2] ?? 0) * 0x100 +
    (bytes[offset + 3] ?? 0)
  );
}

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
