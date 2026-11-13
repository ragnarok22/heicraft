import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { AbortError, detectHeic } from "../src";
import { normalizeInput } from "../src/utils/input";
import { createFtypBytes } from "./helpers";

const file = vi.hoisted(() => ({
  stat: vi.fn(),
  read: vi.fn(),
  close: vi.fn(),
  createReadStream: vi.fn(),
}));
const open = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", () => ({ open }));

describe("bounded file input", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    open.mockResolvedValue(file);
    file.close.mockResolvedValue(undefined);
  });

  it("checks size on the opened file before reading and closes rejected files", async () => {
    mockFile(new Uint8Array(5));

    await expect(normalizeInput("photo.heic", { maxInputBytes: 4 })).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
    });
    expect(open).toHaveBeenCalledExactlyOnceWith("photo.heic", "r");
    expect(file.read).not.toHaveBeenCalled();
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("accepts an exact-limit file, including partial reads", async () => {
    mockFile(new Uint8Array([1, 2, 3, 4]), 4, 2);

    await expect(normalizeInput("photo.heic", { maxInputBytes: 4 })).resolves.toEqual({
      bytes: new Uint8Array([1, 2, 3, 4]),
      filename: "photo.heic",
    });
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("bounds reads even when a file grows after the size check", async () => {
    mockFile(new Uint8Array(100), 2);

    await expect(normalizeInput("photo.heic", { maxInputBytes: 4 })).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
    });
    expect(file.read).toHaveBeenCalledOnce();
    expect(file.read.mock.calls[0][0].byteLength).toBe(5);
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("caps the cumulative input size across chunks", async () => {
    const chunkSize = 64 * 1024;
    mockFile(new Uint8Array(chunkSize + 100), 1);

    await expect(
      normalizeInput("photo.heic", { maxInputBytes: chunkSize + 3 }),
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT_EXCEEDED" });
    expect(file.read).toHaveBeenCalledTimes(2);
    expect(file.read.mock.calls[1][2]).toBe(4);
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("accepts growth within the limit and handles shrinking files", async () => {
    mockFile(new Uint8Array([1, 2, 3]), 1);
    await expect(normalizeInput("photo.heic", { maxInputBytes: 4 })).resolves.toMatchObject({
      bytes: new Uint8Array([1, 2, 3]),
    });

    mockFile(new Uint8Array([4]), 3);
    await expect(normalizeInput("photo.heic", { maxInputBytes: 4 })).resolves.toMatchObject({
      bytes: new Uint8Array([4]),
    });
  });

  it("closes files when reading fails", async () => {
    mockFile(new Uint8Array(1));
    file.read.mockRejectedValue(new Error("read failed"));

    await expect(normalizeInput("photo.heic")).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "Unable to read input file: photo.heic",
    });
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("aborts an active conversion read and closes the file", async () => {
    mockFile(createFtypBytes("heic", ["mif1"]));
    const controller = new AbortController();
    let started!: () => void;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const destroyed = vi.fn();
    file.createReadStream.mockImplementation(
      ({ signal }) =>
        new Readable({
          signal,
          read() {
            started();
          },
          destroy(error, callback) {
            destroyed();
            callback(error);
          },
        }),
    );
    const result = normalizeInput("photo.heic", { signal: controller.signal });
    const assertion = expect(result).rejects.toBeInstanceOf(AbortError);
    await reading;
    controller.abort();
    await assertion;
    expect(destroyed).toHaveBeenCalledOnce();
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("stops partial detection reads after cancellation and closes the file", async () => {
    mockFile(createFtypBytes("heic", ["mif1"]));
    const controller = new AbortController();
    file.read.mockImplementationOnce(async () => {
      controller.abort();
      return { bytesRead: 0 };
    });
    await expect(detectHeic("photo.heic", { signal: controller.signal })).rejects.toBeInstanceOf(
      AbortError,
    );
    expect(file.read).toHaveBeenCalledOnce();
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("keeps the byte cap when using cancellable file reads", async () => {
    mockFile(new Uint8Array(2));
    file.createReadStream.mockReturnValue(Readable.from([new Uint8Array(5)]));
    const signal = new AbortController().signal;
    await expect(normalizeInput("photo.heic", { maxInputBytes: 4, signal })).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
    });
    expect(file.createReadStream).toHaveBeenCalledWith({
      start: 0,
      end: 4,
      highWaterMark: 5,
      autoClose: false,
      signal,
    });
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("rejects non-regular files without reading", async () => {
    file.stat.mockResolvedValue({ size: 0, isFile: () => false });

    await expect(normalizeInput("directory")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(file.read).not.toHaveBeenCalled();
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("detects a large file by reading only ftyp, including partial reads", async () => {
    const header = createFtypBytes("heic", ["mif1"]);
    mockFile(header, 16 * 1024 * 1024, 3);

    await expect(detectHeic("photo.heic")).resolves.toMatchObject({ isHeic: true });

    expect(file.read.mock.calls.length).toBeGreaterThan(2);
    for (const [, , length, position] of file.read.mock.calls) {
      expect(position + length).toBeLessThanOrEqual(header.byteLength);
    }
    expect(open).toHaveBeenCalledExactlyOnceWith("photo.heic", "r");
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("rejects oversized paths before reading even for partial detection", async () => {
    const header = createFtypBytes("heic");
    mockFile(header, 100);

    await expect(detectHeic("photo.heic", { maxInputBytes: 99 })).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
    });
    expect(file.read).not.toHaveBeenCalled();
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("rechecks growth beyond the byte limit after partial detection", async () => {
    const header = createFtypBytes("heic");
    mockFile(header);
    file.stat.mockResolvedValueOnce({ size: header.byteLength, isFile: () => true });
    file.stat.mockResolvedValue({ size: header.byteLength + 1, isFile: () => true });

    await expect(
      detectHeic("photo.heic", { maxInputBytes: header.byteLength }),
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT_EXCEEDED" });
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("rejects an ftyp truncated during partial detection", async () => {
    const header = createFtypBytes("heic", ["mif1"]);
    mockFile(header.subarray(0, 16), header.byteLength);

    await expect(detectHeic("photo.heic")).resolves.toMatchObject({ isHeic: false });
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("closes the file if partial detection fails to read it", async () => {
    mockFile(createFtypBytes("heic"));
    file.read.mockRejectedValue(new Error("read failed"));

    await expect(detectHeic("photo.heic")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(file.close).toHaveBeenCalledOnce();
  });
});

function mockFile(data: Uint8Array, size = data.byteLength, maxRead = data.byteLength): void {
  file.stat.mockResolvedValue({ size, isFile: () => true });
  let position = 0;
  file.read.mockImplementation(
    async (buffer: Uint8Array, offset: number, length: number, readPosition: number | null) => {
      const start = readPosition ?? position;
      const chunk = data.subarray(start, start + Math.min(length, maxRead));
      buffer.set(chunk, offset);
      position = start + chunk.byteLength;
      return { bytesRead: chunk.byteLength, buffer };
    },
  );
}
