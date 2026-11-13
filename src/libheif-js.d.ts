declare module "libheif-js/wasm-bundle.js" {
  export type HeifImageData = {
    width: number;
    height: number;
    data: Uint8ClampedArray<ArrayBuffer>;
  };

  export type HeifImage = {
    get_width(): number;
    get_height(): number;
    has_alpha_channel(): boolean;
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
