import type { DecodedImage } from "./types";
import { resolveMaxPixels } from "./utils/limits";
import type { HeicMetadata } from "./workers/protocol";
import { getDecoderPool } from "./workers/runtime";

export async function decodeHeic(
  bytes: Uint8Array,
  maxPixels?: number,
  signal?: AbortSignal,
): Promise<DecodedImage> {
  return (await getDecoderPool().run(
    { operation: "decode", bytes, maxPixels: resolveMaxPixels(maxPixels) },
    signal,
  )) as DecodedImage;
}

export async function readHeicMetadata(
  bytes: Uint8Array,
  maxPixels?: number,
  inspectAlpha = false,
  signal?: AbortSignal,
): Promise<HeicMetadata> {
  return (await getDecoderPool().run(
    { operation: "metadata", bytes, maxPixels: resolveMaxPixels(maxPixels), inspectAlpha },
    signal,
  )) as HeicMetadata;
}
