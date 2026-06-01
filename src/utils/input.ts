import { InvalidInputError } from "../errors";
import type { HeicInput, NormalizedInput } from "../types";
import { isBlobLike, isFileLike, isNodeEnvironment } from "./environment";

export async function normalizeInput(input: HeicInput): Promise<NormalizedInput> {
  if (input == null) {
    throw new InvalidInputError("Input is required.");
  }

  if (typeof input === "string") {
    return normalizeFilePath(input);
  }

  if (isBlobLike(input)) {
    const bytes = new Uint8Array(await input.arrayBuffer());
    return {
      bytes,
      filename: isFileLike(input) ? input.name : undefined,
      mimeType: input.type || undefined,
    };
  }

  if (isArrayBuffer(input)) {
    return { bytes: new Uint8Array(input) };
  }

  if (ArrayBuffer.isView(input)) {
    return {
      bytes: new Uint8Array(input.buffer, input.byteOffset, input.byteLength),
    };
  }

  throw new InvalidInputError(
    "Input must be a File, Blob, ArrayBuffer, Uint8Array, Buffer, or Node.js file path.",
  );
}

async function normalizeFilePath(filePath: string): Promise<NormalizedInput> {
  if (!isNodeEnvironment()) {
    throw new InvalidInputError("String file paths are only supported in Node.js.");
  }

  if (filePath.trim() === "") {
    throw new InvalidInputError("Input file path must not be empty.");
  }

  const { readFile } = await import("node:fs/promises");
  let bytes: Uint8Array;
  try {
    bytes = await readFile(filePath);
  } catch {
    throw new InvalidInputError(`Unable to read input file: ${filePath}`);
  }
  const filename = filePath.split(/[\\/]/).at(-1);

  return {
    bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    filename,
  };
}

export function assertNonEmptyInput(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) {
    throw new InvalidInputError("Input must not be empty.");
  }
}

function isArrayBuffer(input: unknown): input is ArrayBuffer {
  return Object.prototype.toString.call(input) === "[object ArrayBuffer]";
}
