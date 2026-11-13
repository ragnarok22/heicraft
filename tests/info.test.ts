import { beforeEach, describe, expect, it, vi } from "vitest";
import { AbortError, getHeicInfo, InvalidInputError, ResourceLimitError } from "../src";
import { readHeicMetadata } from "../src/decoder";
import { WorkerError } from "../src/errors";
import { CountingBlob, createFtypBytes } from "./helpers";

vi.mock("../src/decoder", () => ({
  readHeicMetadata: vi.fn(),
}));

const metadataMock = vi.mocked(readHeicMetadata);

describe("getHeicInfo", () => {
  beforeEach(() => {
    metadataMock.mockReset();
  });

  it("returns basic metadata for valid HEIC input", async () => {
    metadataMock.mockResolvedValue({
      width: 2,
      height: 1,
      imagesCount: 1,
    });

    await expect(getHeicInfo(createFtypBytes("heic"))).resolves.toEqual({
      width: 2,
      height: 1,
      mimeType: "image/heic",
      brand: "heic",
      imagesCount: 1,
    });
  });

  it("opts in to pixel-based alpha inspection", async () => {
    metadataMock.mockResolvedValue({ width: 2, height: 1, imagesCount: 1, hasAlpha: true });
    const input = createFtypBytes("heic");

    await expect(getHeicInfo(input, { inspectAlpha: true })).resolves.toMatchObject({
      hasAlpha: true,
    });
    expect(metadataMock).toHaveBeenCalledExactlyOnceWith(input, 25_000_000, true, undefined);
  });

  it("reads Blob input once before inspecting metadata", async () => {
    metadataMock.mockResolvedValue({
      width: 1,
      height: 1,
      imagesCount: 1,
    });
    const blob = new CountingBlob([createFtypBytes("heic")], { type: "image/heic" });

    await expect(getHeicInfo(blob)).resolves.toMatchObject({
      width: 1,
      height: 1,
    });

    expect(blob.reads).toBe(1);
  });

  it("rejects non-HEIC input", async () => {
    await expect(getHeicInfo(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("rejects oversized input before reading or decoding", async () => {
    const blob = new CountingBlob([createFtypBytes("heic")]);

    await expect(getHeicInfo(blob, { maxInputBytes: blob.size - 1 })).rejects.toBeInstanceOf(
      ResourceLimitError,
    );
    expect(blob.reads).toBe(0);
    expect(metadataMock).not.toHaveBeenCalled();
  });

  it("rejects invalid pixel limits instead of falling back to detection metadata", async () => {
    const blob = new CountingBlob([createFtypBytes("heic")]);

    await expect(getHeicInfo(blob, { maxPixels: 0 })).rejects.toBeInstanceOf(InvalidInputError);
    expect(blob.reads).toBe(0);
    expect(metadataMock).not.toHaveBeenCalled();
  });

  it("passes the pixel limit to metadata inspection without swallowing limit errors", async () => {
    const error = new ResourceLimitError("Too many pixels.");
    metadataMock.mockRejectedValue(error);
    const input = createFtypBytes("heic");

    await expect(getHeicInfo(input, { maxPixels: 100 })).rejects.toBe(error);
    expect(metadataMock).toHaveBeenCalledExactlyOnceWith(input, 100, false, undefined);
  });

  it("rejects empty HEIC-looking input", async () => {
    const file = new File([], "empty.heic", { type: "image/heic" });

    await expect(getHeicInfo(file)).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("returns detection metadata when backend inspection fails", async () => {
    metadataMock.mockRejectedValue(new Error("parse failed"));

    await expect(getHeicInfo(createFtypBytes("heic"))).resolves.toEqual({
      mimeType: "image/heic",
      brand: "heic",
    });
  });

  it("does not hide worker startup or transport failures as partial metadata", async () => {
    const failure = new WorkerError("Worker asset is missing.", {
      cause: new Error("Cannot find module"),
    });
    metadataMock.mockRejectedValue(failure);
    await expect(getHeicInfo(createFtypBytes())).rejects.toBe(failure);
  });

  it("propagates cancellation instead of returning partial metadata", async () => {
    const controller = new AbortController();
    metadataMock.mockImplementation(async () => {
      controller.abort();
      throw new Error("worker terminated");
    });
    await expect(
      getHeicInfo(createFtypBytes("heic"), { signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortError);
    expect(metadataMock).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      25_000_000,
      false,
      controller.signal,
    );
  });

  it("rejects extension-only inputs without invoking the decoder", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.heic", { type: "image/heic" });

    await expect(getHeicInfo(file)).rejects.toBeInstanceOf(InvalidInputError);
    expect(metadataMock).not.toHaveBeenCalled();
  });

  it.each([
    ["mif1", []],
    ["avif", ["mif1"]],
  ] as const)("rejects unconfirmed or unsupported codecs (%s)", async (brand, compatibleBrands) => {
    await expect(getHeicInfo(createFtypBytes(brand, [...compatibleBrands]))).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    expect(metadataMock).not.toHaveBeenCalled();
  });
});
