export { convertHeic } from "./convert";
export { detectHeic, isHeic } from "./detect";
export {
  AbortError,
  ConversionError,
  HeicraftError,
  InvalidInputError,
  ResourceLimitError,
  UnsupportedFormatError,
} from "./errors";
export { getHeicInfo } from "./info";
export type {
  ConvertOptions,
  ConvertResult,
  DecodeOptions,
  HeicDetectionResult,
  HeicExtension,
  HeicInfo,
  HeicInput,
  HeicMimeType,
  InfoOptions,
  InputOptions,
  OutputFormat,
} from "./types";
