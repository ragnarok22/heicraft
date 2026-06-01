export type HeicInput = File | Blob | ArrayBuffer | Uint8Array | string;

export type OutputFormat = "jpeg" | "png" | "webp";

export type ConvertOptions = {
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
  isHeic: boolean;
  brand?: string;
  mimeType?: HeicMimeType;
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
