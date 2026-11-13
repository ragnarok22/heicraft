import { AbortError, throwIfAborted } from "./errors";
import type { HeicDetectionResult, HeicInput, InputOptions, NormalizedInput } from "./types";
import { type InputReader, withInputReader } from "./utils/input";
import { getHeicExtension, getHeicExtensionFromMimeType, getHeicMimeType } from "./utils/mime";

const hevcBrands = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis"]);
const heifBrands = new Set(["mif1", "msf1"]);
const av1Brands = new Set(["avif", "avis"]);
const brandCodes = new Map(
  [...hevcBrands, ...heifBrands, ...av1Brands].map((brand) => [
    brand.charCodeAt(0) * 0x1000000 +
      brand.charCodeAt(1) * 0x10000 +
      brand.charCodeAt(2) * 0x100 +
      brand.charCodeAt(3),
    brand,
  ]),
);
const CHUNK_BYTES = 64 * 1024;
const YIELD_BYTES = 256 * 1024;

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
    createDetectionResult(await readHeifBrand(reader, options.signal), reader),
  );
}

export async function detectNormalizedHeic(
  normalized: NormalizedInput,
  signal?: AbortSignal,
): Promise<HeicDetectionResult> {
  return createDetectionResult(
    await readHeifBrand(
      {
        size: normalized.bytes.byteLength,
        read: async (start, end) => normalized.bytes.subarray(start, end),
      },
      signal,
    ),
    normalized,
  );
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

async function readHeifBrand(
  reader: InputReader,
  signal?: AbortSignal,
): Promise<string | undefined> {
  throwIfAborted(signal);
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
  if (brand && av1Brands.has(brand)) return brand;

  // HEVC cannot short-circuit: a later AV1 brand takes precedence.
  const start = box.headerSize + 8;
  for (let offset = start; offset < box.end; offset += CHUNK_BYTES) {
    if (offset > start && (offset - start) % YIELD_BYTES === 0) {
      // Awaiting already-resolved reads only yields to microtasks, starving timers
      // and user-triggered cancellation. Give the event loop an actual turn.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    throwIfAborted(signal);
    const end = Math.min(offset + CHUNK_BYTES, box.end);
    const bytes = await reader.read(offset, end);
    throwIfAborted(signal);
    if (bytes.byteLength !== end - offset) {
      return undefined;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < bytes.byteLength; index += 4) {
      const candidate = brandCodes.get(view.getUint32(index));
      if (!candidate) continue;
      brand = preferredBrand(brand, candidate);
      if (av1Brands.has(brand)) return brand;
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
