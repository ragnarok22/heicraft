import { afterEach, expect, it, vi } from "vitest";
import { encodeOffscreen } from "../src/encoders/browser";
import { UnsupportedFormatError } from "../src/errors";
import { executeRequest, responseTransfers } from "../src/workers/execute";

const decoded = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([9, 255, 0, 0, 128, 8]).subarray(1, 5),
};
vi.mock("../src/decoder-core.ts", () => ({
  decodeHeic: vi.fn(async () => decoded),
}));

afterEach(() => vi.unstubAllGlobals());

function canvas(blob: Blob, context: { putImageData: ReturnType<typeof vi.fn> } | null) {
  const convertToBlob = vi.fn<(options: ImageEncodeOptions) => Promise<Blob>>(async () => blob);
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        return context;
      }
      convertToBlob(options: ImageEncodeOptions) {
        return convertToBlob(options);
      }
    },
  );
  vi.stubGlobal(
    "ImageData",
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
  );
  return convertToBlob;
}

it("encodes inside a worker without copying RGBA and returns a cloneable Blob", async () => {
  const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
  const putImageData = vi.fn();
  const convertToBlob = canvas(blob, { putImageData });
  const response = await executeRequest({
    id: 1,
    operation: "convert",
    bytes: new Uint8Array([1]),
    format: "png",
    quality: 0.8,
  });
  expect(response).toEqual({ id: 1, ok: true, result: blob });
  expect(responseTransfers(response)).toEqual([]);
  expect(convertToBlob).toHaveBeenCalledWith({ type: "image/png", quality: 0.8 });
  const [image] = putImageData.mock.calls[0];
  expect(image.data.buffer).toBe(decoded.data.buffer);
  expect(image.data.byteOffset).toBe(decoded.data.byteOffset);
  expect([...image.data]).toEqual([255, 0, 0, 128]);
});

it("returns pixels for the DOM fallback when the worker lacks an offscreen context", async () => {
  vi.stubGlobal("OffscreenCanvas", undefined);
  await expect(encodeOffscreen(decoded, "png", 1)).resolves.toBe(decoded);
  canvas(new Blob(), null);
  await expect(encodeOffscreen(decoded, "png", 1)).resolves.toBe(decoded);
});

it("rejects a silent WebP-to-PNG fallback instead of returning mislabeled output", async () => {
  canvas(new Blob([new Uint8Array([1])], { type: "image/png" }), { putImageData: vi.fn() });
  await expect(encodeOffscreen(decoded, "webp", 0.9)).rejects.toBeInstanceOf(
    UnsupportedFormatError,
  );
});
