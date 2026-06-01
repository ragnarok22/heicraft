declare module "heic-decode" {
  export type DecodedHeicImage = {
    width: number;
    height: number;
    data: Uint8ClampedArray | Uint8Array;
  };

  export default function decode(options: { buffer: Uint8Array }): Promise<DecodedHeicImage>;
}
