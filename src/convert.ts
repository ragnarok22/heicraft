import { decodeHeic } from "./decoder";
import { detectNormalizedHeic } from "./detect";
import {
  AbortError,
  ConversionError,
  InvalidInputError,
  ResourceLimitError,
  throwIfAborted,
  UnsupportedFormatError,
} from "./errors";
import type { ConvertOptions, ConvertResult, DecodedImage, HeicInput, OutputFormat } from "./types";
import { isNodeEnvironment } from "./utils/environment";
import { assertNonEmptyInput, normalizeInput } from "./utils/input";
import { resolveMaxPixels } from "./utils/limits";
import { assertOutputFormat, getOutputMimeType, normalizeQuality } from "./utils/mime";
import { withDecodeAdmission } from "./workers/runtime";

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
  const decoded = await withDecodeAdmission(async () => {
    const normalized = await normalizeInput(input, options);
    assertNonEmptyInput(normalized.bytes);
    throwIfAborted(options.signal);

    const detection = detectNormalizedHeic(normalized);
    if (!detection.isHeic) {
      throw new InvalidInputError();
    }
    throwIfAborted(options.signal);

    try {
      return await decodeHeic(normalized.bytes, maxPixels, options.signal);
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
  }, options.signal);
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
}

function assertQuality(quality?: number): void {
  if (quality === undefined) {
    return;
  }

  if (typeof quality !== "number" || Number.isNaN(quality) || quality < 0 || quality > 1) {
    throw new InvalidInputError("Quality must be a number between 0 and 1.");
  }
}

async function encodeInNode(
  decoded: DecodedImage,
  format: OutputFormat,
  quality: number,
): Promise<Uint8Array> {
  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    const { buffer, byteOffset, byteLength } = decoded.data;
    const image = sharp(Buffer.from(buffer, byteOffset, byteLength), {
      raw: {
        width: decoded.width,
        height: decoded.height,
        channels: 4,
      },
    });

    const output =
      format === "jpeg"
        ? await image.jpeg({ quality: normalizeQuality(quality) }).toBuffer()
        : format === "webp"
          ? await image.webp({ quality: normalizeQuality(quality) }).toBuffer()
          : await image.png().toBuffer();

    return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
  } catch (error) {
    if (error instanceof UnsupportedFormatError || error instanceof ConversionError) {
      throw error;
    }
    throw new ConversionError(
      error instanceof Error ? error.message : "Conversion failed while encoding image.",
      { cause: error },
    );
  }
}

async function encodeInBrowser(
  decoded: DecodedImage,
  format: OutputFormat,
  quality: number,
  mimeType: string,
): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new UnsupportedFormatError("Browser conversion requires a DOM canvas environment.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = decoded.width;
  canvas.height = decoded.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new ConversionError("Conversion failed while creating a canvas context.");
  }

  const { buffer, byteOffset, byteLength } = decoded.data;
  const imageData = new ImageData(
    new Uint8ClampedArray(buffer, byteOffset, byteLength),
    decoded.width,
    decoded.height,
  );
  context.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });

  if (!blob) {
    if (format === "webp") {
      throw new UnsupportedFormatError("WebP output is not supported in this environment.");
    }

    throw new ConversionError("Conversion failed while encoding image in the browser.");
  }

  assertBrowserOutputMimeType(blob, format, mimeType);

  return blob;
}

function assertBrowserOutputMimeType(blob: Blob, format: OutputFormat, mimeType: string): void {
  if (!blob.type || blob.type === mimeType) {
    return;
  }

  if (format === "webp") {
    throw new UnsupportedFormatError("WebP output is not supported in this environment.");
  }

  throw new ConversionError(`Expected browser encoder to return ${mimeType}, got ${blob.type}.`);
}
