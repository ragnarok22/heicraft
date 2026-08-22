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
  if (bytes.byteLength < 16 || readAscii(bytes, 4, 8) !== "ftyp") {
    return undefined;
  }

  const size32 = readUint32(bytes, 0);
  let headerSize = 8;
  let boxEnd = bytes.byteLength;

  if (size32 === 1) {
    headerSize = 16;
    if (bytes.byteLength < 24) {
      return undefined;
    }

    const extendedSize = readUint64(bytes, 8);
    if (extendedSize < 24n || extendedSize > BigInt(bytes.byteLength)) {
      return undefined;
    }
    boxEnd = Number(extendedSize);
  } else if (size32 !== 0) {
    if (size32 < 16 || size32 > bytes.byteLength) {
      return undefined;
    }
    boxEnd = size32;
  }

  const brands: string[] = [readAscii(bytes, headerSize, headerSize + 4)];

  for (let offset = headerSize + 8; offset + 4 <= boxEnd; offset += 4) {
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

function readUint64(bytes: Uint8Array, offset: number): bigint {
  return (BigInt(readUint32(bytes, offset)) << 32n) | BigInt(readUint32(bytes, offset + 4));
}

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
