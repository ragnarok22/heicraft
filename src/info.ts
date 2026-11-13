import { readHeicMetadata } from "./decoder";
import { detectNormalizedHeic } from "./detect";
import {
  AbortError,
  InvalidInputError,
  ResourceLimitError,
  UnsupportedFormatError,
  WorkerError,
  throwIfAborted,
} from "./errors";
import type { HeicInfo, HeicInput, InfoOptions } from "./types";
import { assertNonEmptyInput, normalizeInput } from "./utils/input";
import { resolveMaxPixels } from "./utils/limits";
import { withOperationAdmission } from "./workers/runtime";

export async function getHeicInfo(input: HeicInput, options: InfoOptions = {}): Promise<HeicInfo> {
  throwIfAborted(options.signal);
  const maxPixels = resolveMaxPixels(options.maxPixels);
  return withOperationAdmission(async () => {
    const normalized = await normalizeInput(input, options);
    assertNonEmptyInput(normalized.bytes);
    const detection = await detectNormalizedHeic(normalized, options.signal);

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
        await readHeicMetadata(
          normalized.bytes,
          maxPixels,
          options.inspectAlpha ?? false,
          options.signal,
        ),
      );
      throwIfAborted(options.signal);
    } catch (error) {
      throwIfAborted(options.signal);
      if (
        error instanceof AbortError ||
        error instanceof ResourceLimitError ||
        error instanceof UnsupportedFormatError ||
        error instanceof WorkerError
      ) {
        throw error;
      }
      // Detection now requires a binary signature, so its metadata remains useful
      // even when the image metadata cannot be parsed or optional rendering fails.
      return info;
    }

    return info;
  }, options.signal);
}
