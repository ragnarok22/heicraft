import { decodeHeic } from "./decoder";
import { detectNormalizedHeic } from "./detect";
import { InvalidInputError, ResourceLimitError } from "./errors";
import type { DecodeOptions, HeicInfo, HeicInput } from "./types";
import { assertNonEmptyInput, normalizeInput } from "./utils/input";
import { resolveMaxPixels } from "./utils/limits";

export async function getHeicInfo(
  input: HeicInput,
  options: DecodeOptions = {},
): Promise<HeicInfo> {
  const maxPixels = resolveMaxPixels(options.maxPixels);
  const normalized = await normalizeInput(input, options);
  assertNonEmptyInput(normalized.bytes);
  const detection = detectNormalizedHeic(normalized);

  if (!detection.isHeic) {
    throw new InvalidInputError();
  }

  const info: HeicInfo = {
    mimeType: detection.mimeType,
    brand: detection.brand,
  };

  try {
    const decoded = await decodeHeic(normalized.bytes, maxPixels);
    info.width = decoded.width;
    info.height = decoded.height;
    info.hasAlpha = hasAlphaChannel(decoded.data);
  } catch (error) {
    if (error instanceof ResourceLimitError) {
      throw error;
    }
    // Detection now requires a binary signature, so its metadata remains useful
    // even when the image payload cannot be decoded.
    return info;
  }

  return info;
}

function hasAlphaChannel(data: Uint8Array | Uint8ClampedArray): boolean {
  for (let index = 3; index < data.byteLength; index += 4) {
    if (data[index] !== 255) {
      return true;
    }
  }

  return false;
}
