import type { HeifImage } from "libheif-js/wasm-bundle.js";
import type { DecodedImage } from "./types";
import { assertPixelCount, resolveMaxPixels } from "./utils/limits";

export async function decodeHeic(bytes: Uint8Array, maxPixels?: number): Promise<DecodedImage> {
  const pixelLimit = resolveMaxPixels(maxPixels);
  const { default: libheif } = await import("libheif-js/wasm-bundle.js");
  await libheif.ready;

  const decoder = new libheif.HeifDecoder();
  let images: HeifImage[] = [];

  try {
    // Let libheif parse the original BMFF headers, including compatible brands
    // and extended-size boxes, rather than checking a brand at a fixed offset.
    images = decoder.decode(bytes);
    const image = images[0];
    if (!image) {
      throw new Error("HEIF image not found");
    }

    const width = image.get_width();
    const height = image.get_height();
    assertPixelCount(width, height, pixelLimit);
    const data = new Uint8ClampedArray(width * height * 4);

    // Rendering is asynchronous; keep the native handles alive until it completes.
    return await new Promise<DecodedImage>((resolve, reject) => {
      image.display({ width, height, data }, (rendered) => {
        if (!rendered) {
          reject(new Error("HEIF processing error"));
          return;
        }

        resolve(rendered);
      });
    });
  } finally {
    for (const image of images) {
      image.free();
    }
    if (decoder.decoder) {
      libheif.heif_context_free(decoder.decoder);
      decoder.decoder = null;
    }
  }
}
