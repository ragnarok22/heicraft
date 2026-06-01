export { convertHeic } from "./convert";
export { detectHeic, isHeic } from "./detect";
export { getHeicInfo } from "./info";
export {
  AbortError,
  ConversionError,
  HeicraftError,
  InvalidInputError,
  UnsupportedFormatError,
} from "./errors";
export type {
  ConvertOptions,
  ConvertResult,
  HeicDetectionResult,
  HeicExtension,
  HeicInfo,
  HeicInput,
  HeicMimeType,
  OutputFormat,
} from "./types";
