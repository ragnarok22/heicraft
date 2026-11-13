// Track only buffers allocated by the library. Caller inputs must never be detached.
const ownedInputs = new WeakSet<Uint8Array>();

export function ownInput(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  ownedInputs.add(bytes);
  return bytes;
}

export function prepareInputTransfer(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (
    ownedInputs.delete(bytes) &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes as Uint8Array<ArrayBuffer>;
  }
  return new Uint8Array(bytes);
}
