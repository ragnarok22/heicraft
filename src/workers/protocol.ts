import {
  AbortError,
  ConversionError,
  HeicraftError,
  InvalidInputError,
  ResourceLimitError,
  UnsupportedFormatError,
  WorkerError,
} from "../errors.ts";
import type { DecodedImage, HeicInfo, OutputFormat } from "../types";

export type HeicMetadata = Pick<HeicInfo, "width" | "height" | "imagesCount" | "hasAlpha">;
export type WorkerResult = DecodedImage | HeicMetadata | Blob;
export type DecodeRequest = {
  bytes: Uint8Array;
  maxPixels?: number;
} & (
  | { operation: "decode" }
  | { operation: "metadata"; inspectAlpha?: boolean }
  | { operation: "convert"; format: OutputFormat; quality: number }
);
export type WorkerRequest = DecodeRequest & { id: number };
type SerializedCause = {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedCause;
};
type SerializedError = {
  code: string;
  workerFailure?: boolean;
  message: string;
  stack?: string;
  cause?: SerializedCause;
};
export type WorkerResponse =
  | { id: number; ok: true; result: WorkerResult }
  | { id: number; ok: false; error: SerializedError };

export function serializeError(error: unknown): SerializedError {
  const cause = error instanceof HeicraftError ? error.cause : error;
  return {
    code: error instanceof HeicraftError ? error.code : "CONVERSION_ERROR",
    message: error instanceof Error ? error.message : "HEIC decoding failed.",
    ...(error instanceof HeicraftError ? { stack: error.stack } : {}),
    ...(error instanceof WorkerError ? { workerFailure: true } : {}),
    ...(cause === undefined ? {} : { cause: serializeCause(cause) }),
  };
}

export function deserializeError(error: SerializedError): HeicraftError {
  const options = error.cause === undefined ? undefined : { cause: deserializeCause(error.cause) };
  if (error.workerFailure) {
    const result = new WorkerError(error.message, options);
    if (error.stack !== undefined) result.stack = error.stack;
    return result;
  }
  let result: HeicraftError;
  switch (error.code) {
    case "ABORT_ERROR":
      result = new AbortError(error.message, options);
      break;
    case "INVALID_INPUT":
      result = new InvalidInputError(error.message, options);
      break;
    case "RESOURCE_LIMIT_EXCEEDED":
      result = new ResourceLimitError(error.message, options);
      break;
    case "UNSUPPORTED_FORMAT":
      result = new UnsupportedFormatError(error.message, options);
      break;
    default:
      result = new ConversionError(error.message, options);
  }
  if (error.stack !== undefined) result.stack = error.stack;
  return result;
}

function serializeCause(error: unknown, seen = new Set<unknown>()): SerializedCause {
  // Copy diagnostics only: arbitrary thrown values can contain uncloneable objects.
  if (!(error instanceof Error)) {
    return {
      name: "Error",
      message: typeof error === "string" ? error : "Unknown HEIC decoder failure.",
    };
  }
  const result: SerializedCause = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  seen.add(error);
  // Bound recursion even if a backend supplies cyclic or deeply nested causes.
  if (error.cause !== undefined && !seen.has(error.cause) && seen.size < 8) {
    result.cause = serializeCause(error.cause, seen);
  }
  return result;
}

function deserializeCause(cause: SerializedCause): Error {
  const options = cause.cause === undefined ? undefined : { cause: deserializeCause(cause.cause) };
  const error = new Error(cause.message, options);
  error.name = cause.name;
  if (cause.stack !== undefined) error.stack = cause.stack;
  return error;
}
