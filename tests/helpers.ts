export function createFtypBytes(
  majorBrand = "heic",
  compatibleBrands: string[] = [],
): Uint8Array<ArrayBuffer> {
  const brands = [majorBrand, "0000", ...compatibleBrands];
  const size = 8 + brands.length * 4;
  const bytes = new Uint8Array(size);

  writeUint32(bytes, 0, size);
  writeAscii(bytes, 4, "ftyp");

  let offset = 8;
  for (const brand of brands) {
    writeAscii(bytes, offset, brand.slice(0, 4).padEnd(4, " "));
    offset += 4;
  }

  return bytes;
}

export class CountingBlob extends Blob {
  reads = 0;
  bytesRead = 0;
  slices: [number, number][] = [];

  override async arrayBuffer(): Promise<ArrayBuffer> {
    this.reads += 1;
    const buffer = await super.arrayBuffer();
    this.bytesRead += buffer.byteLength;
    return buffer;
  }

  override slice(start = 0, end = this.size, contentType?: string): Blob {
    this.slices.push([start, end]);
    const slice = super.slice(start, end, contentType);
    const arrayBuffer = slice.arrayBuffer.bind(slice);
    slice.arrayBuffer = async () => {
      const buffer = await arrayBuffer();
      this.bytesRead += buffer.byteLength;
      return buffer;
    };
    return slice;
  }
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}
