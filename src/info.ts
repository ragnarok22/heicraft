import { decodeHeic } from "./decoder";
import { detectNormalizedHeic } from "./detect";
import { InvalidInputError } from "./errors";
import type { HeicInfo, HeicInput } from "./types";
import { assertNonEmptyInput, normalizeInput } from "./utils/input";

export async function getHeicInfo(input: HeicInput): Promise<HeicInfo> {
  const normalized = await normalizeInput(input);
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
    const decoded = await decodeHeic(normalized.bytes);
    info.width = decoded.width;
    info.height = decoded.height;
    info.hasAlpha = hasAlphaChannel(decoded.data);
  } catch {
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
