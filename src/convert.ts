import { convertHeicInWorker, decodeHeic } from "./decoder";
import { detectNormalizedHeic } from "./detect";
import { canEncodeOffscreen, encodeInBrowser } from "./encoders/browser";
import { encodeInNode } from "./encoders/node";
import {
  AbortError,
  ConversionError,
  InvalidInputError,
  ResourceLimitError,
  throwIfAborted,
  UnsupportedFormatError,
} from "./errors";
import type { ConvertOptions, ConvertResult, DecodedImage, HeicInput } from "./types";
import { isNodeEnvironment } from "./utils/environment";
import { assertNonEmptyInput, normalizeInput } from "./utils/input";
import { resolveMaxPixels } from "./utils/limits";
import { assertOutputFormat, getOutputMimeType } from "./utils/mime";
import { withOperationAdmission } from "./workers/runtime";

export async function convertHeic(
  input: HeicInput,
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  throwIfAborted(options.signal);

  const format = options.format ?? "jpeg";
  assertOutputFormat(format);
  assertQuality(options.quality);
  const maxPixels = resolveMaxPixels(options.maxPixels);

  const quality = options.quality ?? 0.92;
  return withOperationAdmission(async () => {
    const normalized = await normalizeInput(input, options);
    assertNonEmptyInput(normalized.bytes);
    throwIfAborted(options.signal);

    const detection = await detectNormalizedHeic(normalized, options.signal);
    if (!detection.isHeic) {
      throw new InvalidInputError();
    }
    throwIfAborted(options.signal);

    let decoded: DecodedImage;
    try {
      if (!isNodeEnvironment() && canEncodeOffscreen()) {
        const result = await convertHeicInWorker(
          normalized.bytes,
          maxPixels,
          format,
          quality,
          options.signal,
        );
        throwIfAborted(options.signal);
        if (result instanceof Blob) {
          return {
            data: result,
            format,
            mimeType: getOutputMimeType(format),
            filename: options.filename,
          };
        }
        decoded = result;
      } else {
        decoded = await decodeHeic(normalized.bytes, maxPixels, options.signal);
      }
    } catch (error) {
      throwIfAborted(options.signal);
      if (
        error instanceof AbortError ||
        error instanceof UnsupportedFormatError ||
        error instanceof ConversionError ||
        error instanceof ResourceLimitError
      ) {
        throw error;
      }
      throw new ConversionError(
        error instanceof Error ? error.message : "Conversion failed while decoding HEIC image.",
        { cause: error },
      );
    }
    throwIfAborted(options.signal);

    const mimeType = getOutputMimeType(format);
    let data: Blob | Uint8Array;
    try {
      data = isNodeEnvironment()
        ? await encodeInNode(decoded, format, quality)
        : await encodeInBrowser(decoded, format, quality, mimeType);
    } catch (error) {
      throwIfAborted(options.signal);
      if (error instanceof UnsupportedFormatError || error instanceof ConversionError) {
        throw error;
      }
      throw new ConversionError(
        error instanceof Error ? error.message : "Conversion failed while encoding image.",
        { cause: error },
      );
    }
    throwIfAborted(options.signal);

    return {
      data,
      format,
      mimeType,
      filename: options.filename,
    };
  }, options.signal);
}

function assertQuality(quality?: number): void {
  if (quality === undefined) {
    return;
  }

  if (typeof quality !== "number" || Number.isNaN(quality) || quality < 0 || quality > 1) {
    throw new InvalidInputError("Quality must be a number between 0 and 1.");
  }
}
