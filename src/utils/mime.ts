import { UnsupportedFormatError } from "../errors";
import type { HeicExtension, HeicMimeType, OutputFormat } from "../types";

const outputMimeTypes: Record<OutputFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const heicBrands = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis"]);
const heifBrands = new Set(["mif1", "msf1"]);

export function assertOutputFormat(format: string): asserts format is OutputFormat {
  if (format !== "jpeg" && format !== "png" && format !== "webp") {
    throw new UnsupportedFormatError("Output format must be jpeg, png, or webp.");
  }
}

export function getOutputMimeType(format: OutputFormat): string {
  return outputMimeTypes[format];
}

export function getHeicMimeType(brand?: string, extension?: HeicExtension): HeicMimeType | undefined {
  if (brand && heicBrands.has(brand)) {
    return "image/heic";
  }

  if (brand && heifBrands.has(brand)) {
    return "image/heif";
  }

  if (extension === "heic") {
    return "image/heic";
  }

  if (extension === "heif") {
    return "image/heif";
  }

  return undefined;
}

export function getHeicExtension(filename?: string): HeicExtension | undefined {
  if (!filename) {
    return undefined;
  }

  const match = /\.hei([cf])$/i.exec(filename);
  if (!match) {
    return undefined;
  }

  return match[1]?.toLowerCase() === "c" ? "heic" : "heif";
}

export function getHeicExtensionFromMimeType(mimeType?: string): HeicExtension | undefined {
  if (mimeType === "image/heic") {
    return "heic";
  }

  if (mimeType === "image/heif") {
    return "heif";
  }

  return undefined;
}

export function normalizeQuality(quality: number): number {
  return Math.round(quality * 100);
}
