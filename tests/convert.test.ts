import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AbortError,
  ConversionError,
  convertHeic,
  InvalidInputError,
  ResourceLimitError,
  UnsupportedFormatError,
} from "../src";
import { decodeHeic } from "../src/decoder";
import { CountingBlob, createFtypBytes } from "./helpers";

vi.mock("../src/decoder", () => ({
  decodeHeic: vi.fn(),
}));

const decodeMock = vi.mocked(decodeHeic);

describe("convertHeic", () => {
  afterEach(() => {
    decodeMock.mockReset();
  });

  it("rejects invalid quality values", async () => {
    await expect(convertHeic(new Uint8Array([1]), { quality: -0.1 })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    await expect(convertHeic(new Uint8Array([1]), { quality: 1.1 })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    await expect(convertHeic(new Uint8Array([1]), { quality: Number.NaN })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
  });

  it("rejects unsupported output formats", async () => {
    await expect(
      convertHeic(new Uint8Array([1]), { format: "gif" as never }),
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it("rejects empty input", async () => {
    await expect(convertHeic(new Uint8Array())).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("rejects oversized input without reading or decoding", async () => {
    const blob = new CountingBlob([createFtypBytes("heic")]);

    await expect(convertHeic(blob, { maxInputBytes: blob.size - 1 })).rejects.toBeInstanceOf(
      ResourceLimitError,
    );
    expect(blob.reads).toBe(0);
    expect(decodeMock).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, null, "4"])(
    "rejects invalid maxPixels (%s) before reading",
    async (maxPixels) => {
      const blob = new CountingBlob([createFtypBytes("heic")]);

      await expect(convertHeic(blob, { maxPixels: maxPixels as number })).rejects.toBeInstanceOf(
        InvalidInputError,
      );
      expect(blob.reads).toBe(0);
      expect(decodeMock).not.toHaveBeenCalled();
    },
  );

  it("passes the configured pixel limit to the decoder and preserves limit errors", async () => {
    const error = new ResourceLimitError("Too many pixels.");
    decodeMock.mockRejectedValue(error);
    const input = createFtypBytes("heic");

    await expect(convertHeic(input, { maxPixels: 100 })).rejects.toBe(error);
    expect(decodeMock).toHaveBeenCalledExactlyOnceWith(input, 100, undefined);
  });

  it("supports AbortSignal before conversion starts", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      convertHeic(createFtypBytes("heic"), { signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortError);
  });

  it("rejects non-HEIC input", async () => {
    await expect(convertHeic(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(InvalidInputError);
  });

  it.each([
    ["JPEG", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
    ["generic HEIF", createFtypBytes("mif1")],
    ["AVIF", createFtypBytes("avif", ["mif1"])],
  ])("rejects %s with misleading HEIC metadata before decoding", async (_label, bytes) => {
    const file = new File([bytes], "photo.heic", { type: "image/heic" });

    await expect(convertHeic(file)).rejects.toBeInstanceOf(InvalidInputError);
    expect(decodeMock).not.toHaveBeenCalled();
  });

  it("wraps decoder failures in ConversionError", async () => {
    const cause = new Error("decode failed");
    decodeMock.mockRejectedValue(cause);

    await expect(convertHeic(createFtypBytes("heic"))).rejects.toMatchObject({
      name: "ConversionError",
      code: "CONVERSION_ERROR",
      message: "decode failed",
      cause,
    });
  });

  it("uses a fallback message for non-Error decoder failures", async () => {
    decodeMock.mockRejectedValue("decode failed");

    await expect(convertHeic(createFtypBytes("heic"))).rejects.toMatchObject({
      code: "CONVERSION_ERROR",
      message: "Conversion failed while decoding HEIC image.",
      cause: "decode failed",
    });
  });

  it("does not rewrap typed decoder errors or discard their causes", async () => {
    const error = new ConversionError("decode failed", { cause: new Error("invalid payload") });
    decodeMock.mockRejectedValue(error);

    await expect(convertHeic(createFtypBytes("heic"))).rejects.toBe(error);
  });

  it("preserves an abort when the decoder fails after cancellation", async () => {
    const controller = new AbortController();
    decodeMock.mockImplementation(async () => {
      controller.abort();
      throw new Error("decode failed");
    });

    await expect(
      convertHeic(createFtypBytes("heic"), { signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortError);
  });

  it("accepts Blob input for validation and detection", async () => {
    mockDecoderFailure();
    const blob = new Blob([createFtypBytes("heic")], { type: "image/heic" });

    await expect(convertHeic(blob)).rejects.toBeInstanceOf(ConversionError);
  });

  it("reads Blob input once before decoding", async () => {
    mockDecoderFailure();
    const blob = new CountingBlob([createFtypBytes("heic")], { type: "image/heic" });

    await expect(convertHeic(blob)).rejects.toBeInstanceOf(ConversionError);

    expect(blob.reads).toBe(1);
  });

  it("rejects excess work before reading its input", async () => {
    let reject!: (error: Error) => void;
    decodeMock.mockReturnValue(
      new Promise((_resolve, no) => {
        reject = no;
      }),
    );
    const pending = Array.from({ length: 10 }, () => convertHeic(createFtypBytes()));
    const settled = Promise.allSettled(pending);
    const excess = new CountingBlob([createFtypBytes()]);
    try {
      await expect(convertHeic(excess)).rejects.toBeInstanceOf(ResourceLimitError);
      expect(excess.reads).toBe(0);
    } finally {
      reject(new Error("test completed"));
      await settled;
    }
  });

  it("accepts Buffer-compatible input", async () => {
    mockDecoderFailure();
    const buffer = Buffer.from(createFtypBytes("heic"));

    await expect(convertHeic(buffer)).rejects.toBeInstanceOf(ConversionError);
  });
});

function mockDecoderFailure(): void {
  decodeMock.mockRejectedValue(new Error("decode failed"));
}
