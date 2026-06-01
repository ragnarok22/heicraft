import { describe, expect, it } from "vitest";
import {
  AbortError,
  ConversionError,
  HeicraftError,
  InvalidInputError,
  UnsupportedFormatError,
} from "../src";

describe("custom errors", () => {
  it("exposes typed custom errors with stable codes", () => {
    expect(new InvalidInputError()).toBeInstanceOf(HeicraftError);
    expect(new InvalidInputError().code).toBe("INVALID_INPUT");
    expect(new UnsupportedFormatError().code).toBe("UNSUPPORTED_FORMAT");
    expect(new ConversionError().code).toBe("CONVERSION_ERROR");
    expect(new AbortError().code).toBe("ABORT_ERROR");
  });
});
