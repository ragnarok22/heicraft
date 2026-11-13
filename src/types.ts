export type HeicInput = File | Blob | ArrayBuffer | Uint8Array | string;

export type OutputFormat = "jpeg" | "png" | "webp";

export type InputOptions = {
  /** Maximum input size in bytes. Defaults to 20 MiB (20 * 1024 * 1024). */
  maxInputBytes?: number;
};

export type DecodeOptions = InputOptions & {
  /** Maximum pixel count of the image being decoded. Defaults to 25,000,000. */
  maxPixels?: number;
};

export type ConvertOptions = DecodeOptions & {
  format?: OutputFormat;
  quality?: number;
  filename?: string;
  signal?: AbortSignal;
};

export type ConvertResult = {
  data: Blob | Uint8Array;
  format: OutputFormat;
  mimeType: string;
  filename?: string;
};

export type HeicMimeType = "image/heic" | "image/heif";

export type HeicExtension = "heic" | "heif";

export type HeicDetectionResult = {
  /** True only when the binary signature identifies HEVC, not just a HEIF container. */
  isHeic: boolean;
  /** True when the binary signature identifies a HEIF container, including AVIF. */
  isHeif: boolean;
  /** Codec indicated by ftyp brands; undefined for generic HEIF containers. */
  codec?: "hevc" | "av1";
  brand?: string;
  /** Derived from the binary signature, never from filename or MIME hints. */
  mimeType?: HeicMimeType;
  /** Filename or MIME hint only; does not affect isHeic or isHeif. */
  extension?: HeicExtension;
};

export type HeicInfo = {
  width?: number;
  height?: number;
  mimeType?: HeicMimeType;
  brand?: string;
  imagesCount?: number;
  hasAlpha?: boolean;
};

export type NormalizedInput = {
  bytes: Uint8Array;
  filename?: string;
  mimeType?: string;
};

export type DecodedImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
};
