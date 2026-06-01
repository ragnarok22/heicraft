import { afterEach, describe, expect, it, vi } from "vitest";
import { createFtypBytes } from "./helpers";

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
    vi.doUnmock("heic-decode");
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

  it("wraps Node.js encoder failures", async () => {
    mockDecoderAndSharp(Buffer.from([]), new Error("sharp failed"));
    const { convertHeic } = await import("../src/convert");

    await expect(convertHeic(createFtypBytes("heic"))).rejects.toMatchObject({
      code: "CONVERSION_ERROR",
      message: "sharp failed",
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

  it("rejects browser conversion without a DOM canvas", async () => {
    mockBrowserEnvironment();
    mockDecoderAndSharp(Buffer.from([]));
    vi.stubGlobal("document", undefined);
    const { convertHeic } = await importBrowserConvert();

    await expect(convertHeic(createFtypBytes("heic"))).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
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

  it("wraps browser canvas encoding failures", async () => {
    mockBrowserEnvironment();
    mockDecoderAndSharp(Buffer.from([]));
    mockCanvas({ blob: null });
    const { convertHeic } = await importBrowserConvert();

    await expect(convertHeic(createFtypBytes("heic"), { format: "png" })).rejects.toMatchObject({
      code: "CONVERSION_ERROR",
    });
  });
});

function mockDecoderAndSharp(
  output: Buffer,
  error?: Error,
  beforeResolve?: () => void,
): SharpCalls {
  vi.doMock("heic-decode", () => ({
    default: vi.fn().mockResolvedValue(decodedImage),
  }));

  const toBuffer = vi.fn(async () => {
    beforeResolve?.();
    if (error) {
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
}: {
  blob?: Blob | null;
  context?: { putImageData: ReturnType<typeof vi.fn> } | null;
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
      toBlob: vi.fn((resolve: (blob: Blob | null) => void) => resolve(blob)),
    })),
  });
}
