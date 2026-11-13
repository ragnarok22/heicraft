import {
  AbortError,
  ConversionError,
  HeicraftError,
  InvalidInputError,
  ResourceLimitError,
  UnsupportedFormatError,
} from "../errors.ts";
import type { DecodedImage, HeicInfo } from "../types";

export type HeicMetadata = Pick<HeicInfo, "width" | "height" | "imagesCount" | "hasAlpha">;
export type WorkerResult = DecodedImage | HeicMetadata;
export type DecodeRequest = {
  operation: "decode" | "metadata";
  bytes: Uint8Array;
  maxPixels?: number;
  inspectAlpha?: boolean;
};
export type WorkerRequest = DecodeRequest & { id: number };
export type WorkerResponse =
  | { id: number; ok: true; result: WorkerResult }
  | { id: number; ok: false; error: { code: string; message: string } };

export function serializeError(error: unknown): { code: string; message: string } {
  return {
    code: error instanceof HeicraftError ? error.code : "CONVERSION_ERROR",
    message: error instanceof Error ? error.message : "HEIC decoding failed.",
  };
}

export function deserializeError(error: { code: string; message: string }): HeicraftError {
  switch (error.code) {
    case "ABORT_ERROR":
      return new AbortError(error.message);
    case "INVALID_INPUT":
      return new InvalidInputError(error.message);
    case "RESOURCE_LIMIT_EXCEEDED":
      return new ResourceLimitError(error.message);
    case "UNSUPPORTED_FORMAT":
      return new UnsupportedFormatError(error.message);
    default:
      return new ConversionError(error.message);
  }
}
