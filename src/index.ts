export { convertHeic } from "./convert";
export { detectHeic, isHeic } from "./detect";
export { getHeicInfo } from "./info";
export {
  AbortError,
  ConversionError,
  HeicraftError,
  InvalidInputError,
  ResourceLimitError,
  UnsupportedFormatError,
} from "./errors";
export type {
  ConvertOptions,
  ConvertResult,
  DecodeOptions,
  HeicDetectionResult,
  HeicExtension,
  HeicInfo,
  HeicInput,
  HeicMimeType,
  InputOptions,
  OutputFormat,
} from "./types";
