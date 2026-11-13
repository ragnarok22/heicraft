import { describe, expect, it } from "vitest";
import {
  AbortError,
  ConversionError,
  HeicraftError,
  InvalidInputError,
  ResourceLimitError,
  UnsupportedFormatError,
} from "../src";

describe("custom errors", () => {
  it("exposes typed custom errors with stable codes", () => {
    expect(new InvalidInputError()).toBeInstanceOf(HeicraftError);
    expect(new InvalidInputError().code).toBe("INVALID_INPUT");
    expect(new ResourceLimitError()).toBeInstanceOf(HeicraftError);
    expect(new ResourceLimitError().code).toBe("RESOURCE_LIMIT_EXCEEDED");
    expect(new UnsupportedFormatError().code).toBe("UNSUPPORTED_FORMAT");
    expect(new ConversionError().code).toBe("CONVERSION_ERROR");
    expect(new AbortError().code).toBe("ABORT_ERROR");
  });

  it("preserves the base error constructor when accepting a cause", () => {
    const cause = new Error("backend failed");
    const error = new HeicraftError("Conversion failed.", "CUSTOM_ERROR", { cause });

    expect(error.cause).toBe(cause);
    expect(error.code).toBe("CUSTOM_ERROR");
    expect(error.name).toBe("HeicraftError");
  });

  it.each([
    InvalidInputError,
    ResourceLimitError,
    UnsupportedFormatError,
    ConversionError,
    AbortError,
  ])("accepts cause options in %s", (ErrorType) => {
    const cause = new Error("backend failed");
    const error = new ErrorType(undefined, { cause });

    expect(error.cause).toBe(cause);
    expect(error.message).toBe(new ErrorType().message);
    expect(error.code).toBe(new ErrorType().code);
  });
});
