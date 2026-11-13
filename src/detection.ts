// Keep this entry independent of conversion, encoders, and worker factories.
export { detectHeic, isHeic } from "./detect";
export { AbortError, HeicraftError, InvalidInputError, ResourceLimitError } from "./errors";
export type {
  HeicDetectionResult,
  HeicExtension,
  HeicInput,
  HeicMimeType,
  InputOptions,
} from "./types";
