import { ConversionError, UnsupportedFormatError } from "../errors.ts";
import type { DecodedImage, OutputFormat } from "../types";

export function canEncodeOffscreen(): boolean {
  return (
    typeof OffscreenCanvas !== "undefined" &&
    typeof OffscreenCanvas.prototype.convertToBlob === "function"
  );
}

/** Fall back to the DOM encoder if this worker cannot create an offscreen context. */
export async function encodeOffscreen(
  decoded: DecodedImage,
  format: OutputFormat,
  quality: number,
): Promise<Blob | DecodedImage> {
  if (!canEncodeOffscreen()) return decoded;
  const canvas = new OffscreenCanvas(decoded.width, decoded.height);
  const context = canvas.getContext("2d");
  if (!context) return decoded;
  try {
    context.putImageData(toImageData(decoded), 0, 0);
    const mimeType = `image/${format}`;
    const blob = await canvas.convertToBlob({ type: mimeType, quality });
    assertBrowserOutputMimeType(blob, format, mimeType);
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function encodeInBrowser(
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
  try {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new ConversionError("Conversion failed while creating a canvas context.");
    }
    context.putImageData(toImageData(decoded), 0, 0);
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
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function toImageData(decoded: DecodedImage): ImageData {
  const { buffer, byteOffset, byteLength } = decoded.data;
  return new ImageData(
    new Uint8ClampedArray(buffer, byteOffset, byteLength),
    decoded.width,
    decoded.height,
  );
}

function assertBrowserOutputMimeType(blob: Blob, format: OutputFormat, mimeType: string): void {
  if (!blob.type || blob.type === mimeType) return;
  if (format === "webp") {
    throw new UnsupportedFormatError("WebP output is not supported in this environment.");
  }
  throw new ConversionError(`Expected browser encoder to return ${mimeType}, got ${blob.type}.`);
}
