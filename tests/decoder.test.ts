import type { HeifImage } from "libheif-js/wasm-bundle.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeHeic } from "../src/decoder";

const backend = vi.hoisted(() => ({
  decode: vi.fn(),
  freeContext: vi.fn(),
}));

vi.mock("libheif-js/wasm-bundle.js", () => ({
  default: {
    HeifDecoder: class {
      decoder: number | null = 42;
      decode = backend.decode;
    },
    heif_context_free: backend.freeContext,
  },
}));

describe("libheif decoder adapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [8_000, 6_000, undefined],
    [2, 1, 1],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  ])("rejects %s × %s before allocating RGBA or rendering", async (width, height, maxPixels) => {
    const first = mockImage(width, height);
    const second = mockImage();
    backend.decode.mockReturnValue([first, second]);
    const allocate = vi.spyOn(globalThis, "Uint8ClampedArray").mockImplementation(() => {
      throw new Error("RGBA must not be allocated.");
    });

    await expect(decodeHeic(new Uint8Array([1]), maxPixels)).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
    });
    expect(allocate).not.toHaveBeenCalled();
    expect(first.display).not.toHaveBeenCalled();
    expect(first.free).toHaveBeenCalledOnce();
    expect(second.free).toHaveBeenCalledOnce();
    expect(backend.freeContext).toHaveBeenCalledExactlyOnceWith(42);
  });

  it("accepts the exact pixel limit", async () => {
    const image = mockImage(2, 2);
    image.display.mockImplementation((frame, callback) => callback(frame));
    backend.decode.mockReturnValue([image]);

    await expect(decodeHeic(new Uint8Array([1]), 4)).resolves.toMatchObject({
      width: 2,
      height: 2,
      data: new Uint8ClampedArray(16),
    });
  });

  it.each([
    [0, 1],
    [-1, 1],
    [1, 0],
    [1.5, 1],
    [1, Number.NaN],
    [Number.POSITIVE_INFINITY, 1],
    [2 ** 53, 1],
  ])("rejects invalid dimensions %s × %s before rendering", async (width, height) => {
    const image = mockImage(width, height);
    backend.decode.mockReturnValue([image]);
    const allocate = vi.spyOn(globalThis, "Uint8ClampedArray").mockImplementation(() => {
      throw new Error("RGBA must not be allocated.");
    });

    await expect(decodeHeic(new Uint8Array([1]))).rejects.toMatchObject({
      code: "CONVERSION_ERROR",
    });
    expect(allocate).not.toHaveBeenCalled();
    expect(image.display).not.toHaveBeenCalled();
    expect(image.free).toHaveBeenCalledOnce();
    expect(backend.freeContext).toHaveBeenCalledExactlyOnceWith(42);
  });

  it("keeps all handles alive until rendering completes and passes bytes unchanged", async () => {
    const first = mockImage();
    const second = mockImage();
    backend.decode.mockReturnValue([first, second]);
    const rendering = new Promise<{
      frame: Parameters<HeifImage["display"]>[0];
      callback: Parameters<HeifImage["display"]>[1];
    }>((resolve) => {
      first.display.mockImplementation((frame, callback) => resolve({ frame, callback }));
    });
    const bytes = new Uint8Array([1, 2, 3]);
    const decoding = decodeHeic(bytes);
    const { frame, callback } = await rendering;

    expect(backend.decode).toHaveBeenCalledWith(bytes);
    expect(backend.decode.mock.calls[0][0]).toBe(bytes);
    expect(first.free).not.toHaveBeenCalled();
    expect(second.free).not.toHaveBeenCalled();
    expect(backend.freeContext).not.toHaveBeenCalled();

    callback(frame);

    await expect(decoding).resolves.toEqual({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray(8),
    });
    expect(first.free).toHaveBeenCalledOnce();
    expect(second.free).toHaveBeenCalledOnce();
    expect(second.display).not.toHaveBeenCalled();
    expect(backend.freeContext).toHaveBeenCalledExactlyOnceWith(42);
  });

  it("releases the context when no image is found", async () => {
    backend.decode.mockReturnValue([]);

    await expect(decodeHeic(new Uint8Array([1]))).rejects.toThrow("HEIF image not found");

    expect(backend.freeContext).toHaveBeenCalledExactlyOnceWith(42);
  });

  it("releases the context when parsing throws", async () => {
    backend.decode.mockImplementation(() => {
      throw new Error("parse failed");
    });

    await expect(decodeHeic(new Uint8Array([1]))).rejects.toThrow("parse failed");

    expect(backend.freeContext).toHaveBeenCalledExactlyOnceWith(42);
  });

  it.each(["callback failure", "exception"])(
    "releases all handles after a rendering %s",
    async (mode) => {
      const first = mockImage();
      const second = mockImage();
      first.display.mockImplementation((_frame, callback) => {
        if (mode === "exception") {
          throw new Error("HEIF processing error");
        }
        callback(null);
      });
      backend.decode.mockReturnValue([first, second]);

      await expect(decodeHeic(new Uint8Array([1]))).rejects.toThrow("HEIF processing error");

      expect(first.free).toHaveBeenCalledOnce();
      expect(second.free).toHaveBeenCalledOnce();
      expect(backend.freeContext).toHaveBeenCalledExactlyOnceWith(42);
    },
  );
});

function mockImage(width = 2, height = 1) {
  return {
    get_width: () => width,
    get_height: () => height,
    display: vi.fn<HeifImage["display"]>(),
    free: vi.fn(),
  };
}
