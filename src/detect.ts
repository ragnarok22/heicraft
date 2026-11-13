import { AbortError, throwIfAborted } from "./errors";
import type { HeicDetectionResult, HeicInput, InputOptions, NormalizedInput } from "./types";
import { type InputReader, withInputReader } from "./utils/input";
import { getHeicExtension, getHeicExtensionFromMimeType, getHeicMimeType } from "./utils/mime";

const hevcBrands = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis"]);
const heifBrands = new Set(["mif1", "msf1"]);
const av1Brands = new Set(["avif", "avis"]);

export async function isHeic(input: HeicInput, options: InputOptions = {}): Promise<boolean> {
  try {
    return (await detectHeic(input, options)).isHeic;
  } catch (error) {
    throwIfAborted(options.signal);
    if (error instanceof AbortError) throw error;
    return false;
  }
}

export async function detectHeic(
  input: HeicInput,
  options: InputOptions = {},
): Promise<HeicDetectionResult> {
  return withInputReader(input, options, async (reader) =>
    createDetectionResult(await readHeifBrand(reader), reader),
  );
}

export function detectNormalizedHeic(normalized: NormalizedInput): HeicDetectionResult {
  return createDetectionResult(detectHeifBrand(normalized.bytes), normalized);
}

function createDetectionResult(
  brand: string | undefined,
  input: { filename?: string; mimeType?: string },
): HeicDetectionResult {
  const codec =
    brand && av1Brands.has(brand) ? "av1" : brand && hevcBrands.has(brand) ? "hevc" : undefined;
  const extension =
    getHeicExtension(input.filename) ?? getHeicExtensionFromMimeType(input.mimeType);

  return {
    isHeic: codec === "hevc",
    isHeif: brand !== undefined,
    codec,
    brand,
    mimeType: getHeicMimeType(brand),
    extension,
  };
}

export function detectHeifBrand(bytes: Uint8Array): string | undefined {
  const box = readFtypBox(bytes, bytes.byteLength);
  if (!box) {
    return undefined;
  }

  let brand = preferredBrand(undefined, readAscii(bytes, box.headerSize, box.headerSize + 4));
  for (let offset = box.headerSize + 8; offset < box.end; offset += 4) {
    brand = preferredBrand(brand, readAscii(bytes, offset, offset + 4));
  }
  return brand;
}

async function readHeifBrand(reader: InputReader): Promise<string | undefined> {
  const header = await reader.read(0, Math.min(16, reader.size));
  const box = readFtypBox(header, reader.size);
  if (!box) {
    return undefined;
  }

  const major = box.headerSize === 8 ? header.subarray(8) : await reader.read(16, 24);
  if (major.byteLength !== 8) {
    return undefined;
  }
  let brand = preferredBrand(undefined, readAscii(major, 0, 4));

  // Every compatible brand matters: an AV1 brand may occur after a HEVC brand.
  // Scan large (including size-zero) boxes in bounded, four-byte-aligned chunks.
  for (let offset = box.headerSize + 8; offset < box.end; offset += 64 * 1024) {
    const end = Math.min(offset + 64 * 1024, box.end);
    const bytes = await reader.read(offset, end);
    if (bytes.byteLength !== end - offset) {
      return undefined;
    }
    for (let index = 0; index < bytes.byteLength; index += 4) {
      brand = preferredBrand(brand, readAscii(bytes, index, index + 4));
    }
  }
  return brand;
}

function readFtypBox(
  bytes: Uint8Array,
  inputSize: number,
): { headerSize: number; end: number } | undefined {
  if (bytes.byteLength < 16 || readAscii(bytes, 4, 8) !== "ftyp") {
    return undefined;
  }

  const size32 = readUint32(bytes, 0);
  let headerSize = 8;
  let boxEnd = inputSize;

  if (size32 === 1) {
    headerSize = 16;
    const extendedSize = readUint64(bytes, 8);
    if (extendedSize < 24n || extendedSize > BigInt(inputSize)) {
      return undefined;
    }
    boxEnd = Number(extendedSize);
  } else if (size32 !== 0) {
    if (size32 < 16 || size32 > inputSize) {
      return undefined;
    }
    boxEnd = size32;
  }

  if ((boxEnd - headerSize - 8) % 4 !== 0) {
    return undefined;
  }

  return { headerSize, end: boxEnd };
}

function preferredBrand(current: string | undefined, candidate: string): string | undefined {
  // A generic HEIF container brand does not identify its codec. Prefer explicit
  // codec brands, rejecting AV1 even when HEVC or metadata hints are also present.
  if (current && av1Brands.has(current)) return current;
  if (av1Brands.has(candidate)) return candidate;
  if (current && hevcBrands.has(current)) return current;
  if (hevcBrands.has(candidate)) return candidate;
  return current ?? (heifBrands.has(candidate) ? candidate : undefined);
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
  return String.fromCharCode(...bytes.subarray(start, end));
}
