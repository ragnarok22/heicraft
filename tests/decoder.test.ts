import type { HeifImage } from "libheif-js/wasm-bundle";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeHeic } from "../src/decoder";

const backend = vi.hoisted(() => ({
  decode: vi.fn(),
  freeContext: vi.fn(),
}));

vi.mock("libheif-js/wasm-bundle", () => ({
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

function mockImage() {
  return {
    get_width: () => 2,
    get_height: () => 1,
    display: vi.fn<HeifImage["display"]>(),
    free: vi.fn(),
  };
}
