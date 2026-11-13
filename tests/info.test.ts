import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHeicInfo, InvalidInputError } from "../src";
import { decodeHeic } from "../src/decoder";
import { CountingBlob, createFtypBytes } from "./helpers";

vi.mock("../src/decoder", () => ({
  decodeHeic: vi.fn(),
}));

const decodeMock = vi.mocked(decodeHeic);

describe("getHeicInfo", () => {
  beforeEach(() => {
    decodeMock.mockReset();
  });

  it("returns decoded metadata for valid HEIC input", async () => {
    decodeMock.mockResolvedValue({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 128]),
    });

    await expect(getHeicInfo(createFtypBytes("heic"))).resolves.toEqual({
      width: 2,
      height: 1,
      mimeType: "image/heic",
      brand: "heic",
      hasAlpha: true,
    });
  });

  it("reads Blob input once before decoding", async () => {
    decodeMock.mockResolvedValue({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255]),
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

  it("rejects empty HEIC-looking input", async () => {
    const file = new File([], "empty.heic", { type: "image/heic" });

    await expect(getHeicInfo(file)).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("returns detection metadata when signature-detected decoding fails", async () => {
    decodeMock.mockRejectedValue(new Error("decode failed"));

    await expect(getHeicInfo(createFtypBytes("heic"))).resolves.toEqual({
      mimeType: "image/heic",
      brand: "heic",
    });
  });

  it("rejects extension-only inputs without invoking the decoder", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.heic", { type: "image/heic" });

    await expect(getHeicInfo(file)).rejects.toBeInstanceOf(InvalidInputError);
    expect(decodeMock).not.toHaveBeenCalled();
  });

  it.each([
    ["mif1", []],
    ["avif", ["mif1"]],
  ] as const)("rejects unconfirmed or unsupported codecs (%s)", async (brand, compatibleBrands) => {
    await expect(getHeicInfo(createFtypBytes(brand, [...compatibleBrands]))).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    expect(decodeMock).not.toHaveBeenCalled();
  });
});
