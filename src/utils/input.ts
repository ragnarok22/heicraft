import type { FileHandle } from "node:fs/promises";
import { InvalidInputError, ResourceLimitError } from "../errors";
import type { HeicInput, InputOptions, NormalizedInput } from "../types";
import { isBlobLike, isFileLike, isNodeEnvironment } from "./environment";
import { assertInputSize, resolveMaxInputBytes } from "./limits";

export async function normalizeInput(
  input: HeicInput,
  options: InputOptions = {},
): Promise<NormalizedInput> {
  const maxInputBytes = resolveMaxInputBytes(options.maxInputBytes);
  if (input == null) {
    throw new InvalidInputError("Input is required.");
  }

  if (typeof input === "string") {
    return normalizeFilePath(input, maxInputBytes);
  }

  if (isBlobLike(input)) {
    assertInputSize(input.size, maxInputBytes);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await input.arrayBuffer());
    } catch {
      throw new InvalidInputError("Unable to read Blob input.");
    }
    assertInputSize(bytes.byteLength, maxInputBytes);
    return {
      bytes,
      filename: isFileLike(input) ? input.name : undefined,
      mimeType: input.type || undefined,
    };
  }

  if (isArrayBuffer(input)) {
    assertInputSize(input.byteLength, maxInputBytes);
    return { bytes: new Uint8Array(input) };
  }

  if (ArrayBuffer.isView(input)) {
    assertInputSize(input.byteLength, maxInputBytes);
    return {
      bytes: new Uint8Array(input.buffer, input.byteOffset, input.byteLength),
    };
  }

  throw new InvalidInputError(
    "Input must be a File, Blob, ArrayBuffer, Uint8Array, Buffer, or Node.js file path.",
  );
}

async function normalizeFilePath(
  filePath: string,
  maxInputBytes: number,
): Promise<NormalizedInput> {
  if (!isNodeEnvironment()) {
    throw new InvalidInputError("String file paths are only supported in Node.js.");
  }

  if (filePath.trim() === "") {
    throw new InvalidInputError("Input file path must not be empty.");
  }

  const { open } = await import("node:fs/promises");
  let bytes: Uint8Array;
  try {
    const file = await open(filePath, "r");
    try {
      const stats = await file.stat();
      if (!stats.isFile()) {
        throw new InvalidInputError("Input file path must refer to a regular file.");
      }
      assertInputSize(stats.size, maxInputBytes);
      bytes = await readBoundedFile(file, maxInputBytes);
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error instanceof InvalidInputError || error instanceof ResourceLimitError) {
      throw error;
    }
    throw new InvalidInputError(`Unable to read input file: ${filePath}`);
  }
  const filename = filePath.split(/[\\/]/).at(-1);

  return {
    bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    filename,
  };
}

async function readBoundedFile(file: FileHandle, maxInputBytes: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    // Read at most one byte beyond the limit, even if the file grows after stat().
    const chunk = new Uint8Array(Math.min(64 * 1024, maxInputBytes - total + 1));
    const { bytesRead } = await file.read(chunk, 0, chunk.byteLength, null);
    if (bytesRead === 0) {
      break;
    }
    total += bytesRead;
    assertInputSize(total, maxInputBytes);
    chunks.push(bytesRead === chunk.byteLength ? chunk : chunk.slice(0, bytesRead));
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function assertNonEmptyInput(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) {
    throw new InvalidInputError("Input must not be empty.");
  }
}

function isArrayBuffer(input: unknown): input is ArrayBuffer {
  return Object.prototype.toString.call(input) === "[object ArrayBuffer]";
}
