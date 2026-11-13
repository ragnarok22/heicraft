import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeInput } from "../src/utils/input";

const file = vi.hoisted(() => ({
  stat: vi.fn(),
  read: vi.fn(),
  close: vi.fn(),
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

  it("rejects non-regular files without reading", async () => {
    file.stat.mockResolvedValue({ size: 0, isFile: () => false });

    await expect(normalizeInput("directory")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(file.read).not.toHaveBeenCalled();
    expect(file.close).toHaveBeenCalledOnce();
  });
});

function mockFile(data: Uint8Array, size = data.byteLength, maxRead = data.byteLength): void {
  file.stat.mockResolvedValue({ size, isFile: () => true });
  let position = 0;
  file.read.mockImplementation(async (buffer: Uint8Array, offset: number, length: number) => {
    const chunk = data.subarray(position, position + Math.min(length, maxRead));
    buffer.set(chunk, offset);
    position += chunk.byteLength;
    return { bytesRead: chunk.byteLength, buffer };
  });
}
