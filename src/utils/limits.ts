import { ConversionError, InvalidInputError, ResourceLimitError } from "../errors";

const DEFAULT_MAX_INPUT_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_PIXELS = 25_000_000;

export function resolveMaxInputBytes(value?: number): number {
  return resolveLimit(value, DEFAULT_MAX_INPUT_BYTES, "maxInputBytes");
}

export function resolveMaxPixels(value?: number): number {
  return resolveLimit(value, DEFAULT_MAX_PIXELS, "maxPixels");
}

function resolveLimit(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidInputError(`${name} must be a positive safe integer.`);
  }
  return value;
}

export function assertInputSize(byteLength: number, maxInputBytes: number): void {
  if (byteLength > maxInputBytes) {
    throw new ResourceLimitError(
      `Input size (${byteLength} bytes) exceeds maxInputBytes (${maxInputBytes}).`,
    );
  }
}

export function assertPixelCount(width: number, height: number, maxPixels: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new ConversionError("Image dimensions must be positive safe integers.");
  }

  // Avoid overflow and loss of precision for dimensions from untrusted headers.
  const pixels = BigInt(width) * BigInt(height);
  if (pixels > BigInt(maxPixels)) {
    throw new ResourceLimitError(`Image pixel count (${pixels}) exceeds maxPixels (${maxPixels}).`);
  }
}
