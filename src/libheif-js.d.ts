declare module "libheif-js/wasm-bundle" {
  export type HeifImageData = {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  };

  export type HeifImage = {
    get_width(): number;
    get_height(): number;
    display(image: HeifImageData, callback: (image: HeifImageData | null) => void): void;
    free(): void;
  };

  class HeifDecoder {
    decoder: number | null;
    decode(buffer: Uint8Array): HeifImage[];
  }

  const libheif: {
    ready?: Promise<unknown>;
    HeifDecoder: typeof HeifDecoder;
    heif_context_free(context: number): void;
  };

  export default libheif;
}
