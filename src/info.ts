import { ConversionError, InvalidInputError } from "./errors";
import { decodeHeic } from "./decoder";
import { detectHeic } from "./detect";
import type { HeicInfo, HeicInput } from "./types";
import { normalizeInput } from "./utils/input";

export async function getHeicInfo(input: HeicInput): Promise<HeicInfo> {
  const normalized = await normalizeInput(input);
  const detection = await detectHeic(input);

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
  } catch (error) {
    if (detection.brand) {
      return info;
    }

    throw new ConversionError(error instanceof Error ? error.message : undefined);
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
