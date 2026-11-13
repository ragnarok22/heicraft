import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { AbortError, detectHeic, InvalidInputError, isHeic } from "../src";
import { CountingBlob, createFtypBytes } from "./helpers";
import { assertNonEmptyInput, normalizeInput } from "../src/utils/input";
import {
  getHeicExtension,
  getHeicExtensionFromMimeType,
  getHeicMimeType,
  getOutputMimeType,
  normalizeQuality,
} from "../src/utils/mime";

describe("input utilities", () => {
  it("does not read an input when its signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const blob = new CountingBlob([new Uint8Array([1])]);

    await expect(normalizeInput(blob, { signal: controller.signal })).rejects.toBeInstanceOf(
      AbortError,
    );
    expect(blob.reads).toBe(0);
  });

  it("cancels an in-progress Blob stream and preserves AbortError", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    let started!: () => void;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    class PendingBlob extends Blob {
      override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
        return new ReadableStream({ pull: () => started(), cancel });
      }
    }
    const result = normalizeInput(new PendingBlob([new Uint8Array([1])]), {
      signal: controller.signal,
    });
    const assertion = expect(result).rejects.toBeInstanceOf(AbortError);
    await reading;
    controller.abort();
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("reads Blob streams with a signal and enforces the cumulative byte limit", async () => {
    const signal = new AbortController().signal;
    await expect(
      normalizeInput(new Blob([new Uint8Array([1, 2, 3])]), { signal }),
    ).resolves.toMatchObject({ bytes: new Uint8Array([1, 2, 3]) });
    class GrowingBlob extends Blob {
      override get size() {
        return 1;
      }
    }
    await expect(
      normalizeInput(new GrowingBlob([new Uint8Array(2)]), { signal, maxInputBytes: 1 }),
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT_EXCEEDED" });
  });

  it("propagates cancellation through both detection APIs", async () => {
    const controller = new AbortController();
    controller.abort();
    for (const detect of [detectHeic, isHeic]) {
      await expect(detect(createFtypBytes(), { signal: controller.signal })).rejects.toBeInstanceOf(
        AbortError,
      );
    }
  });

  it("rejects missing and unknown input", async () => {
    await expect(normalizeInput(null as never)).rejects.toBeInstanceOf(InvalidInputError);
    await expect(normalizeInput({} as never)).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("normalizes ArrayBuffer input", async () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;

    await expect(normalizeInput(buffer)).resolves.toEqual({ bytes: new Uint8Array([1, 2, 3]) });
  });

  it("normalizes a Blob without MIME metadata", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);

    await expect(normalizeInput(blob)).resolves.toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      filename: undefined,
      mimeType: undefined,
    });
  });

  it("rejects oversized Blobs before reading them", async () => {
    const blob = new CountingBlob([new Uint8Array(4)]);

    await expect(normalizeInput(blob, { maxInputBytes: 3 })).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
    });
    expect(blob.reads).toBe(0);
  });

  it("enforces the default 20 MiB input limit before reading", async () => {
    class OversizedBlob extends CountingBlob {
      override get size(): number {
        return 20 * 1024 * 1024 + 1;
      }
    }
    const blob = new OversizedBlob([]);

    await expect(normalizeInput(blob)).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
    });
    expect(blob.reads).toBe(0);
  });

  it.each([
    ["Blob", new Blob([new Uint8Array(4)])],
    ["ArrayBuffer", new ArrayBuffer(4)],
    ["Uint8Array", new Uint8Array(4)],
    ["Buffer", Buffer.alloc(4)],
  ])("accepts the exact byte limit and rejects larger %s inputs", async (_name, input) => {
    await expect(normalizeInput(input, { maxInputBytes: 4 })).resolves.toMatchObject({
      bytes: new Uint8Array(4),
    });
    await expect(normalizeInput(input, { maxInputBytes: 3 })).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
    });
  });

  it("limits the view rather than its backing buffer", async () => {
    const input = new Uint8Array([1, 2, 3, 4]).subarray(1, 3);

    await expect(normalizeInput(input, { maxInputBytes: 2 })).resolves.toEqual({
      bytes: new Uint8Array([2, 3]),
    });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, null, "4"])(
    "rejects invalid maxInputBytes (%s) without reading",
    async (maxInputBytes) => {
      const blob = new CountingBlob([new Uint8Array(1)]);

      await expect(
        normalizeInput(blob, { maxInputBytes: maxInputBytes as number }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(blob.reads).toBe(0);
    },
  );

  it("wraps Blob read failures", async () => {
    const cause = new Error("read failed");
    class FailingBlob extends Blob {
      override arrayBuffer(): Promise<ArrayBuffer> {
        return Promise.reject(cause);
      }
    }

    await expect(normalizeInput(new FailingBlob())).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "Unable to read Blob input.",
      cause,
    });
  });

  it("normalizes cross-realm ArrayBuffer input", async () => {
    const buffer = vm.runInNewContext("new Uint8Array([1, 2, 3]).buffer") as ArrayBuffer;

    await expect(normalizeInput(buffer)).resolves.toEqual({ bytes: new Uint8Array([1, 2, 3]) });
  });

  it("normalizes Node.js file path input", async () => {
    const directory = await mkdtemp(join(tmpdir(), "heicraft-input-"));
    const filePath = join(directory, "photo.heic");

    try {
      await writeFile(filePath, new Uint8Array([1, 2, 3]));

      await expect(normalizeInput(filePath, { maxInputBytes: 2 })).rejects.toMatchObject({
        code: "RESOURCE_LIMIT_EXCEEDED",
      });
      await expect(normalizeInput(filePath)).resolves.toEqual({
        bytes: new Uint8Array([1, 2, 3]),
        filename: "photo.heic",
      });
      await expect(
        normalizeInput(filePath, { signal: new AbortController().signal }),
      ).resolves.toMatchObject({ bytes: new Uint8Array([1, 2, 3]) });
      await writeFile(filePath, createFtypBytes("heic", ["mif1"]));
      await expect(
        detectHeic(filePath, { signal: new AbortController().signal }),
      ).resolves.toMatchObject({ isHeic: true });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects empty Node.js file paths and empty bytes", async () => {
    await expect(normalizeInput(" ")).rejects.toBeInstanceOf(InvalidInputError);
    expect(() => assertNonEmptyInput(new Uint8Array())).toThrow(InvalidInputError);
  });

  it("wraps unreadable Node.js file paths", async () => {
    const filePath = join(tmpdir(), `heicraft-missing-${Date.now()}.heic`);

    await expect(normalizeInput(filePath)).rejects.toBeInstanceOf(InvalidInputError);
  });
});

describe("MIME utilities", () => {
  it("maps output MIME types", () => {
    expect(getOutputMimeType("jpeg")).toBe("image/jpeg");
    expect(getOutputMimeType("png")).toBe("image/png");
    expect(getOutputMimeType("webp")).toBe("image/webp");
  });

  it("maps HEIC/HEIF brands and extensions", () => {
    expect(getHeicMimeType("hevc")).toBe("image/heic");
    expect(getHeicMimeType("msf1")).toBe("image/heif");
    expect(getHeicMimeType(undefined, "heic")).toBe("image/heic");
    expect(getHeicMimeType(undefined, "heif")).toBe("image/heif");
    expect(getHeicMimeType("avif")).toBeUndefined();
  });

  it("extracts HEIC/HEIF extensions and MIME fallbacks", () => {
    expect(getHeicExtension("PHOTO.HEIC")).toBe("heic");
    expect(getHeicExtension("photo.heif")).toBe("heif");
    expect(getHeicExtension("photo.jpg")).toBeUndefined();
    expect(getHeicExtension()).toBeUndefined();
    expect(getHeicExtensionFromMimeType("image/heic")).toBe("heic");
    expect(getHeicExtensionFromMimeType("image/heif")).toBe("heif");
    expect(getHeicExtensionFromMimeType("image/jpeg")).toBeUndefined();
  });

  it("normalizes quality for encoders", () => {
    expect(normalizeQuality(0)).toBe(1);
    expect(normalizeQuality(0.925)).toBe(93);
  });
});
