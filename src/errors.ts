export class HeicraftError extends Error {
  code: string;

  constructor(message: string, code = "HEICRAFT_ERROR") {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidInputError extends HeicraftError {
  constructor(message = "Input is not a valid HEIC or HEIF file.") {
    super(message, "INVALID_INPUT");
  }
}

export class UnsupportedFormatError extends HeicraftError {
  constructor(message = "Output format must be jpeg, png, or webp.") {
    super(message, "UNSUPPORTED_FORMAT");
  }
}

export class ConversionError extends HeicraftError {
  constructor(message = "Conversion failed while decoding HEIC image.") {
    super(message, "CONVERSION_ERROR");
  }
}

export class AbortError extends HeicraftError {
  constructor(message = "Conversion was aborted.") {
    super(message, "ABORT_ERROR");
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new AbortError();
  }
}
