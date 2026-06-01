import type { DecodedImage } from "./types";

type HeicDecodeModule = {
  default?: HeicDecodeFunction;
} & HeicDecodeFunction;

type HeicDecodeFunction = (options: { buffer: Uint8Array }) => Promise<DecodedImage>;

export async function decodeHeic(bytes: Uint8Array): Promise<DecodedImage> {
  const decodeModule = (await import("heic-decode")) as HeicDecodeModule;
  const decode = decodeModule.default ?? decodeModule;

  return decode({ buffer: bytes });
}
