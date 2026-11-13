import type { HeifImage } from "libheif-js/wasm-bundle.js";
import { ConversionError, WorkerError } from "./errors.ts";
import type { DecodedImage, HeicInfo } from "./types";
import { assertPixelCount, resolveMaxPixels } from "./utils/limits.ts";

export async function decodeHeic(bytes: Uint8Array, maxPixels?: number): Promise<DecodedImage> {
  const pixelLimit = resolveMaxPixels(maxPixels);
  return withHeicImages(bytes, (image) => {
    const { width, height } = readDimensions(image, pixelLimit);
    return renderImage(image, width, height);
  });
}

export async function readHeicMetadata(
  bytes: Uint8Array,
  maxPixels?: number,
  inspectAlpha = false,
): Promise<Pick<HeicInfo, "width" | "height" | "imagesCount" | "hasAlpha">> {
  const pixelLimit = resolveMaxPixels(maxPixels);
  return withHeicImages(bytes, async (image, images) => {
    const dimensions = readDimensions(image, pixelLimit);
    const info: Pick<HeicInfo, "width" | "height" | "imagesCount" | "hasAlpha"> = {
      ...dimensions,
      imagesCount: images.length,
    };

    if (inspectAlpha) {
      // A channel can be entirely opaque; its presence alone does not prove transparency.
      if (!image.has_alpha_channel()) {
        info.hasAlpha = false;
      } else {
        try {
          const rendered = await renderImage(image, dimensions.width, dimensions.height);
          info.hasAlpha = hasNonOpaquePixels(rendered.data);
        } catch (error) {
          // Optional pixel inspection must not discard dimensions already read.
          // Only recover from rendering errors, not allocation or infrastructure failures.
          if (!(error instanceof ConversionError)) throw error;
        }
      }
    }
    return info;
  });
}

async function withHeicImages<T>(
  bytes: Uint8Array,
  inspect: (image: HeifImage, images: HeifImage[]) => T | Promise<T>,
): Promise<T> {
  let libheif: typeof import("libheif-js/wasm-bundle.js").default;
  let decoder: InstanceType<typeof libheif.HeifDecoder>;
  try {
    ({ default: libheif } = await import("libheif-js/wasm-bundle.js"));
    await libheif.ready;
    decoder = new libheif.HeifDecoder();
  } catch (error) {
    throw new WorkerError("Unable to initialize the HEIC decoder.", { cause: error });
  }
  let images: HeifImage[] = [];

  try {
    // Let libheif parse the original BMFF headers, including compatible brands
    // and extended-size boxes, rather than checking a brand at a fixed offset.
    images = decoder.decode(bytes);
    const image = images[0];
    if (!image) {
      throw new Error("HEIF image not found");
    }

    // Await rendering or inspection before releasing native handles.
    return await inspect(image, images);
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

function readDimensions(image: HeifImage, maxPixels: number): { width: number; height: number } {
  const width = image.get_width();
  const height = image.get_height();
  assertPixelCount(width, height, maxPixels);
  return { width, height };
}

function renderImage(image: HeifImage, width: number, height: number): Promise<DecodedImage> {
  const data = new Uint8ClampedArray(width * height * 4);
  return new Promise((resolve, reject) => {
    try {
      const premultiplied = image.is_premultiplied_alpha();
      image.display({ width, height, data }, (rendered) => {
        if (!rendered) {
          reject(new ConversionError("HEIF processing error"));
          return;
        }
        // Sharp and ImageData expect straight RGBA, but libheif preserves association.
        if (premultiplied) unpremultiplyAlpha(rendered.data);
        resolve(rendered);
      });
    } catch (error) {
      reject(new ConversionError("HEIF processing error", { cause: error }));
    }
  });
}

function unpremultiplyAlpha(data: Uint8Array | Uint8ClampedArray): void {
  for (let index = 0; index < data.byteLength; index += 4) {
    const alpha = data[index + 3];
    if (alpha === 255) continue;
    // Fully transparent pixels have no recoverable RGB; clear them without dividing by zero.
    const scale = alpha === 0 ? 0 : 255 / alpha;
    for (let channel = 0; channel < 3; channel++) {
      data[index + channel] = Math.min(255, Math.round(data[index + channel] * scale));
    }
  }
}

function hasNonOpaquePixels(data: Uint8Array | Uint8ClampedArray): boolean {
  for (let index = 3; index < data.byteLength; index += 4) {
    if (data[index] !== 255) {
      return true;
    }
  }
  return false;
}
