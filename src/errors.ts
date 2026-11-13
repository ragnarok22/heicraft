export class HeicraftError extends Error {
  code: string;

  constructor(message: string, code = "HEICRAFT_ERROR", options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidInputError extends HeicraftError {
  constructor(message = "Input is not a valid HEIC or HEIF file.", options?: ErrorOptions) {
    super(message, "INVALID_INPUT", options);
  }
}

export class ResourceLimitError extends HeicraftError {
  constructor(message = "Input exceeds a configured resource limit.", options?: ErrorOptions) {
    super(message, "RESOURCE_LIMIT_EXCEEDED", options);
  }
}

export class UnsupportedFormatError extends HeicraftError {
  constructor(message = "Output format must be jpeg, png, or webp.", options?: ErrorOptions) {
    super(message, "UNSUPPORTED_FORMAT", options);
  }
}

export class ConversionError extends HeicraftError {
  constructor(message = "Conversion failed while decoding HEIC image.", options?: ErrorOptions) {
    super(message, "CONVERSION_ERROR", options);
  }
}

/** Internal distinction: infrastructure failures must never become partial metadata. */
export class WorkerError extends ConversionError {}

export class AbortError extends HeicraftError {
  constructor(message = "Conversion was aborted.", options?: ErrorOptions) {
    super(message, "ABORT_ERROR", options);
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new AbortError();
  }
}
