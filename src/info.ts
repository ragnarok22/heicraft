import { readHeicMetadata } from "./decoder";
import { detectNormalizedHeic } from "./detect";
import { InvalidInputError, ResourceLimitError } from "./errors";
import type { HeicInfo, HeicInput, InfoOptions } from "./types";
import { assertNonEmptyInput, normalizeInput } from "./utils/input";
import { resolveMaxPixels } from "./utils/limits";

export async function getHeicInfo(input: HeicInput, options: InfoOptions = {}): Promise<HeicInfo> {
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
    Object.assign(
      info,
      await readHeicMetadata(normalized.bytes, maxPixels, options.inspectAlpha ?? false),
    );
  } catch (error) {
    if (error instanceof ResourceLimitError) {
      throw error;
    }
    // Detection now requires a binary signature, so its metadata remains useful
    // even when the image metadata cannot be parsed or optional rendering fails.
    return info;
  }

  return info;
}
