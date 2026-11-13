import { afterEach, describe, expect, it, vi } from "vitest";
import { CountingBlob, createFtypBytes } from "./helpers";

const decodedImage = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([255, 0, 0, 255]),
};

type SharpCalls = {
  sharp: ReturnType<typeof vi.fn>;
  jpeg: ReturnType<typeof vi.fn>;
  png: ReturnType<typeof vi.fn>;
  webp: ReturnType<typeof vi.fn>;
  toBuffer: ReturnType<typeof vi.fn>;
};

describe("convertHeic with mocked backends", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../src/decoder");
    vi.doUnmock("sharp");
    vi.doUnmock("../src/utils/environment");
    vi.unstubAllGlobals();
  });

  it("converts to JPEG in Node.js", async () => {
    const calls = mockDecoderAndSharp(Buffer.from([1, 2, 3]));
    const { convertHeic } = await import("../src/convert");

    const result = await convertHeic(createFtypBytes("heic"), {
      format: "jpeg",
      quality: 0.8,
      filename: "photo.jpg",
    });

    expect(result).toEqual({
      data: new Uint8Array([1, 2, 3]),
      format: "jpeg",
      mimeType: "image/jpeg",
      filename: "photo.jpg",
    });
    expect(calls.jpeg).toHaveBeenCalledWith({ quality: 80 });
    expect(calls.sharp).toHaveBeenCalledWith(expect.any(Buffer), {
      raw: { width: 1, height: 1, channels: 4 },
    });
  });

  it("holds admission until encoding completes and releases it after failure", async () => {
    const calls = mockDecoderAndSharp(Buffer.from([1]));
    let finish!: (error?: Error) => void;
    let started!: () => void;
    const encoding = new Promise<void>((resolve) => {
      started = resolve;
    });
    const output = new Promise<Buffer>((resolve, reject) => {
      finish = (error) => (error ? reject(error) : resolve(Buffer.from([1])));
    });
    calls.toBuffer.mockImplementation(() => {
      if (calls.toBuffer.mock.calls.length === 10) started();
      return output;
    });
    const { convertHeic } = await import("../src/convert");
    const pending = Array.from({ length: 10 }, () => convertHeic(createFtypBytes()));
    const settled = Promise.allSettled(pending);
    await encoding;
    const excessInput = new CountingBlob([createFtypBytes()]);
    const excess = convertHeic(excessInput);
    const rejected = Promise.allSettled([excess]);
    try {
      expect(excessInput.reads).toBe(0);
      await expect(excess).rejects.toMatchObject({ code: "RESOURCE_LIMIT_EXCEEDED" });
    } finally {
      finish(new Error("encoder failed"));
      await Promise.all([settled, rejected]);
    }
    calls.toBuffer.mockResolvedValue(Buffer.from([1]));
    await expect(convertHeic(createFtypBytes())).resolves.toBeDefined();
  });

  it.each([
    ["Uint8Array", Uint8Array],
    ["Uint8ClampedArray", Uint8ClampedArray],
  ] as const)("shares the decoded %s pixel range with Sharp", async (_name, ArrayType) => {
    const data = new ArrayType([9, 255, 0, 0, 255, 8]).subarray(1, 5);
    const calls = mockDecoderAndSharp(Buffer.from([1, 2, 3]));
    const { convertHeic } = await import("../src/convert");
    const { decodeHeic } = await import("../src/decoder");
    vi.mocked(decodeHeic).mockResolvedValueOnce({ ...decodedImage, data });

    await convertHeic(createFtypBytes("heic"));

    const [pixels] = calls.sharp.mock.calls[0];
    expect(pixels.buffer).toBe(data.buffer);
    expect(pixels.byteOffset).toBe(data.byteOffset);
    expect(pixels.byteLength).toBe(data.byteLength);
    expect([...pixels]).toEqual([255, 0, 0, 255]);
  });

  it("converts to PNG in Node.js", async () => {
    const calls = mockDecoderAndSharp(Buffer.from([4, 5, 6]));
    const { convertHeic } = await import("../src/convert");

    const result = await convertHeic(createFtypBytes("heic"), { format: "png" });

    expect(result.format).toBe("png");
    expect(result.mimeType).toBe("image/png");
    expect(result.data).toEqual(new Uint8Array([4, 5, 6]));
    expect(calls.png).toHaveBeenCalled();
  });

  it("converts to WebP in Node.js", async () => {
    const calls = mockDecoderAndSharp(Buffer.from([7, 8, 9]));
    const { convertHeic } = await import("../src/convert");

    const result = await convertHeic(createFtypBytes("heic"), { format: "webp", quality: 0.91 });

    expect(result.format).toBe("webp");
    expect(result.mimeType).toBe("image/webp");
    expect(result.data).toEqual(new Uint8Array([7, 8, 9]));
    expect(calls.webp).toHaveBeenCalledWith({ quality: 91 });
  });

  it.each(["jpeg", "webp"] as const)(
    "accepts zero quality for Node.js %s output",
    async (format) => {
      mockDecoder();
      const { convertHeic } = await import("../src/convert");

      const result = await convertHeic(createFtypBytes("heic"), { format, quality: 0 });

      expect(result.data).toBeInstanceOf(Uint8Array);
      if (!(result.data instanceof Uint8Array)) {
        throw new Error("Expected Node.js conversion to return Uint8Array data.");
      }
      expect(result.data.byteLength).toBeGreaterThan(0);
    },
  );

  it("wraps Node.js encoder failures", async () => {
    const cause = new Error("sharp failed");
    mockDecoderAndSharp(Buffer.from([]), cause);
    const { convertHeic } = await import("../src/convert");

    await expect(convertHeic(createFtypBytes("heic"))).rejects.toMatchObject({
      code: "CONVERSION_ERROR",
      message: "sharp failed",
      cause,
    });
  });

  it("uses a fallback message for non-Error Node.js encoder failures", async () => {
    mockDecoderAndSharp(Buffer.from([]), "sharp failed");
    const { convertHeic } = await import("../src/convert");

    await expect(convertHeic(createFtypBytes("heic"))).rejects.toMatchObject({
      code: "CONVERSION_ERROR",
      message: "Conversion failed while encoding image.",
      cause: "sharp failed",
    });
  });

  it("checks abort signals after encoding", async () => {
    const controller = new AbortController();
    mockDecoderAndSharp(Buffer.from([1]), undefined, () => controller.abort());
    const { convertHeic } = await import("../src/convert");

    await expect(
      convertHeic(createFtypBytes("heic"), { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: "ABORT_ERROR",
    });
  });

  it("preserves an abort when the encoder fails after cancellation", async () => {
    const controller = new AbortController();
    mockDecoderAndSharp(Buffer.from([]), new Error("sharp failed"), () => controller.abort());
    const { convertHeic } = await import("../src/convert");

    await expect(
      convertHeic(createFtypBytes("heic"), { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: "ABORT_ERROR",
    });
  });

  it("converts with browser canvas when not running in Node.js", async () => {
    mockBrowserEnvironment();
    mockDecoderAndSharp(Buffer.from([]));
    const { convertHeic } = await importBrowserConvert();

    const blob = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
    mockCanvas({ blob });

    const result = await convertHeic(createFtypBytes("heic"), { format: "jpeg", quality: 0.7 });

    expect(result.data).toBe(blob);
    expect(result.mimeType).toBe("image/jpeg");
  });

  it.each([
    ["Uint8Array", Uint8Array],
    ["Uint8ClampedArray", Uint8ClampedArray],
  ] as const)("shares the decoded %s pixel range with ImageData", async (_name, ArrayType) => {
    const data = new ArrayType([9, 255, 0, 0, 255, 8]).subarray(1, 5);
    mockBrowserEnvironment();
    mockDecoderAndSharp(Buffer.from([]));
    const { convertHeic } = await importBrowserConvert();
    const { decodeHeic } = await import("../src/decoder");
    vi.mocked(decodeHeic).mockResolvedValueOnce({ ...decodedImage, data });
    const putImageData = vi.fn<CanvasRenderingContext2D["putImageData"]>();
    mockCanvas({ context: { putImageData } });

    await convertHeic(createFtypBytes("heic"));

    const [imageData, x, y] = putImageData.mock.calls[0];
    expect(imageData.data).toBeInstanceOf(Uint8ClampedArray);
    expect(imageData.data.buffer).toBe(data.buffer);
    expect(imageData.data.byteOffset).toBe(data.byteOffset);
    expect(imageData.data.byteLength).toBe(data.byteLength);
    expect([...imageData.data]).toEqual([255, 0, 0, 255]);
    expect([imageData.width, imageData.height, x, y]).toEqual([1, 1, 0, 0]);
  });

  it("rejects oversized browser input before reading or creating a canvas", async () => {
    mockBrowserEnvironment();
    const { convertHeic } = await importBrowserConvert();
    const blob = new CountingBlob([createFtypBytes("heic")]);
    const createElement = vi.fn();
    vi.stubGlobal("document", { createElement });

    await expect(convertHeic(blob, { maxInputBytes: blob.size - 1 })).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
    });
    expect(blob.reads).toBe(0);
    expect(createElement).not.toHaveBeenCalled();
  });

  it("rejects browser conversion without a DOM canvas", async () => {
    mockBrowserEnvironment();
    mockDecoderAndSharp(Buffer.from([]));
    vi.stubGlobal("document", undefined);
    const { convertHeic } = await importBrowserConvert();

    await expect(convertHeic(createFtypBytes("heic"))).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });
  });

  it("rejects Node.js file paths in browser environments", async () => {
    mockBrowserEnvironment();
    const { convertHeic } = await importBrowserConvert();

    await expect(convertHeic("photo.heic")).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "String file paths are only supported in Node.js.",
    });
  });

  it("rejects browser conversion without a 2D context", async () => {
    mockBrowserEnvironment();
    mockDecoderAndSharp(Buffer.from([]));
    mockCanvas({ context: null });
    const { convertHeic } = await importBrowserConvert();

    await expect(convertHeic(createFtypBytes("heic"))).rejects.toMatchObject({
      code: "CONVERSION_ERROR",
    });
  });

  it("rejects unsupported browser WebP output", async () => {
    mockBrowserEnvironment();
    mockDecoderAndSharp(Buffer.from([]));
    mockCanvas({ blob: null });
    const { convertHeic } = await importBrowserConvert();

    await expect(convertHeic(createFtypBytes("heic"), { format: "webp" })).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });
  });

  it("rejects browser output when canvas falls back to a different MIME type", async () => {
    mockBrowserEnvironment();
    mockDecoderAndSharp(Buffer.from([]));
    mockCanvas({ blob: new Blob([new Uint8Array([1])], { type: "image/png" }) });
    const { convertHeic } = await importBrowserConvert();

    await expect(convertHeic(createFtypBytes("heic"), { format: "webp" })).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });
  });

  it("rejects mismatched browser MIME types for non-WebP output", async () => {
    mockBrowserEnvironment();
    mockDecoderAndSharp(Buffer.from([]));
    mockCanvas({ blob: new Blob([new Uint8Array([1])], { type: "image/png" }) });
    const { convertHeic } = await importBrowserConvert();

    await expect(convertHeic(createFtypBytes("heic"), { format: "jpeg" })).rejects.toMatchObject({
      code: "CONVERSION_ERROR",
      message: "Expected browser encoder to return image/jpeg, got image/png.",
    });
  });

  it("wraps browser canvas encoding failures", async () => {
    mockBrowserEnvironment();
    mockDecoderAndSharp(Buffer.from([]));
    mockCanvas({ blob: null });
    const { convertHeic } = await importBrowserConvert();

    await expect(convertHeic(createFtypBytes("heic"), { format: "png" })).rejects.toMatchObject({
      code: "CONVERSION_ERROR",
    });
  });

  it("wraps browser canvas exceptions", async () => {
    mockBrowserEnvironment();
    mockDecoderAndSharp(Buffer.from([]));
    const cause = new DOMException("canvas failed");
    mockCanvas({ error: cause });
    const { convertHeic } = await importBrowserConvert();

    await expect(convertHeic(createFtypBytes("heic"), { format: "png" })).rejects.toMatchObject({
      name: "ConversionError",
      code: "CONVERSION_ERROR",
      message: "canvas failed",
      cause,
    });
  });
});

function mockDecoder(): void {
  vi.doMock("../src/decoder", () => ({
    decodeHeic: vi.fn().mockResolvedValue(decodedImage),
  }));
}

function mockDecoderAndSharp(
  output: Buffer,
  error?: unknown,
  beforeResolve?: () => void,
): SharpCalls {
  vi.doMock("../src/decoder", () => ({
    decodeHeic: vi.fn().mockResolvedValue(decodedImage),
  }));

  const toBuffer = vi.fn(async () => {
    beforeResolve?.();
    if (error !== undefined) {
      throw error;
    }

    return output;
  });
  const encoderResult = { toBuffer };
  const jpeg = vi.fn(() => encoderResult);
  const png = vi.fn(() => encoderResult);
  const webp = vi.fn(() => encoderResult);
  const sharp = vi.fn(() => ({ jpeg, png, webp }));

  vi.doMock("sharp", () => ({ default: sharp }));

  return { sharp, jpeg, png, webp, toBuffer };
}

function mockBrowserEnvironment(): void {
  vi.doMock("../src/utils/environment", async () => {
    const actual = await vi.importActual<typeof import("../src/utils/environment")>(
      "../src/utils/environment",
    );

    return {
      ...actual,
      isNodeEnvironment: () => false,
    };
  });
}

async function importBrowserConvert(): Promise<typeof import("../src/convert")> {
  vi.resetModules();
  return import("../src/convert");
}

function mockCanvas({
  blob = new Blob([new Uint8Array([1])], { type: "image/jpeg" }),
  context = { putImageData: vi.fn() },
  error,
}: {
  blob?: Blob | null;
  context?: { putImageData: ReturnType<typeof vi.fn> } | null;
  error?: unknown;
}): void {
  vi.stubGlobal(
    "ImageData",
    class ImageData {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
  );

  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((resolve: (blob: Blob | null) => void) => {
        if (error !== undefined) {
          throw error;
        }

        resolve(blob);
      }),
    })),
  });
}
