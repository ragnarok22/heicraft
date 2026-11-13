import type { FileHandle } from "node:fs/promises";
import { AbortError, InvalidInputError, ResourceLimitError, throwIfAborted } from "../errors";
import type { HeicInput, InputOptions, NormalizedInput } from "../types";
import { isBlobLike, isFileLike, isNodeEnvironment } from "./environment";
import { assertInputSize, resolveMaxInputBytes } from "./limits";

export type InputReader = {
  size: number;
  filename?: string;
  mimeType?: string;
  read(start: number, end: number): Promise<Uint8Array>;
};

/** Inspect ranges without materializing the entire input. File handles stay local to the call. */
export async function withInputReader<T>(
  input: HeicInput,
  options: InputOptions,
  inspect: (reader: InputReader) => Promise<T>,
): Promise<T> {
  throwIfAborted(options.signal);
  const maxInputBytes = resolveMaxInputBytes(options.maxInputBytes);

  if (typeof input === "string") {
    return withInputFile(
      input,
      maxInputBytes,
      async (file, size) => {
        const result = await inspect({
          size,
          filename: input.split(/[\\/]/).at(-1),
          read: (start, end) => readFileRange(file, start, Math.min(end, size), options.signal),
        });
        // Partial inspection must not silently accept growth beyond the input limit.
        throwIfAborted(options.signal);
        assertInputSize((await file.stat()).size, maxInputBytes);
        throwIfAborted(options.signal);
        return result;
      },
      options.signal,
    );
  }

  if (isBlobLike(input)) {
    assertInputSize(input.size, maxInputBytes);
    const result = await inspect({
      size: input.size,
      filename: isFileLike(input) ? input.name : undefined,
      mimeType: input.type || undefined,
      async read(start, end) {
        throwIfAborted(options.signal);
        try {
          return await readBlob(input.slice(start, end), maxInputBytes, options.signal);
        } catch (error) {
          throwIfAborted(options.signal);
          if (error instanceof ResourceLimitError) throw error;
          throw new InvalidInputError("Unable to read Blob input.", { cause: error });
        }
      },
    });
    throwIfAborted(options.signal);
    return result;
  }

  const normalized = await normalizeInput(input, options);
  const result = await inspect({
    ...normalized,
    size: normalized.bytes.byteLength,
    read: async (start, end) => {
      throwIfAborted(options.signal);
      return normalized.bytes.subarray(start, end);
    },
  });
  throwIfAborted(options.signal);
  return result;
}

export async function normalizeInput(
  input: HeicInput,
  options: InputOptions = {},
): Promise<NormalizedInput> {
  throwIfAborted(options.signal);
  const maxInputBytes = resolveMaxInputBytes(options.maxInputBytes);
  if (input == null) {
    throw new InvalidInputError("Input is required.");
  }

  if (typeof input === "string") {
    return normalizeFilePath(input, maxInputBytes, options.signal);
  }

  if (isBlobLike(input)) {
    assertInputSize(input.size, maxInputBytes);
    const bytes = await readBlob(input, maxInputBytes, options.signal);
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
  signal?: AbortSignal,
): Promise<NormalizedInput> {
  const bytes = await withInputFile(
    filePath,
    maxInputBytes,
    (file) =>
      signal
        ? readFileStream(file, 0, maxInputBytes, maxInputBytes, signal)
        : readBoundedFile(file, maxInputBytes),
    signal,
  );
  return { bytes, filename: filePath.split(/[\\/]/).at(-1) };
}

async function withInputFile<T>(
  filePath: string,
  maxInputBytes: number,
  read: (file: FileHandle, size: number) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  if (!isNodeEnvironment()) {
    throw new InvalidInputError("String file paths are only supported in Node.js.");
  }

  if (filePath.trim() === "") {
    throw new InvalidInputError("Input file path must not be empty.");
  }

  const { open, constants } = await import("node:fs/promises");
  throwIfAborted(signal);
  try {
    // A blocking open on a FIFO never reaches fstat() and cannot be cancelled.
    const file = await open(filePath, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    try {
      throwIfAborted(signal);
      const stats = await file.stat();
      throwIfAborted(signal);
      if (!stats.isFile()) {
        throw new InvalidInputError("Input file path must refer to a regular file.");
      }
      assertInputSize(stats.size, maxInputBytes);
      const result = await read(file, stats.size);
      throwIfAborted(signal);
      return result;
    } finally {
      await file.close();
    }
  } catch (error) {
    throwIfAborted(signal);
    if (error instanceof InvalidInputError || error instanceof ResourceLimitError) {
      throw error;
    }
    throw new InvalidInputError(`Unable to read input file: ${filePath}`, { cause: error });
  }
}

async function readFileRange(
  file: FileHandle,
  start: number,
  end: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  if (end <= start) return new Uint8Array();
  const bytes = new Uint8Array(end - start);
  let total = 0;
  while (total < bytes.byteLength) {
    throwIfAborted(signal);
    const { bytesRead } = await file.read(bytes, total, bytes.byteLength - total, start + total);
    throwIfAborted(signal);
    if (bytesRead === 0) {
      break;
    }
    total += bytesRead;
  }
  return bytes.subarray(0, total);
}

async function readFileStream(
  file: FileHandle,
  start: number,
  end: number,
  maxInputBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  // end is inclusive: full reads allow at most one byte beyond the configured cap.
  const stream = file.createReadStream({
    start,
    end,
    highWaterMark: Math.min(64 * 1024, end - start + 1),
    autoClose: false,
    signal,
  });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      throwIfAborted(signal);
      total += chunk.byteLength;
      assertInputSize(total, maxInputBytes);
      chunks.push(chunk);
    }
    throwIfAborted(signal);
    return joinChunks(chunks, total);
  } finally {
    stream.destroy();
  }
}

async function readBlob(
  input: Blob,
  maxInputBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  try {
    if (!signal) return new Uint8Array(await input.arrayBuffer());
    const reader = input.stream().getReader();
    const abort = () => {
      void reader.cancel(new AbortError()).catch(() => {});
    };
    signal.addEventListener("abort", abort, { once: true });
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      if (signal.aborted) abort();
      while (true) {
        throwIfAborted(signal);
        const { done, value } = await reader.read();
        throwIfAborted(signal);
        if (done) break;
        total += value.byteLength;
        assertInputSize(total, maxInputBytes);
        chunks.push(value);
      }
      return joinChunks(chunks, total);
    } finally {
      signal.removeEventListener("abort", abort);
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  } catch (error) {
    throwIfAborted(signal);
    if (error instanceof ResourceLimitError) throw error;
    throw new InvalidInputError("Unable to read Blob input.", { cause: error });
  }
}

function joinChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
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

  return joinChunks(chunks, total);
}

export function assertNonEmptyInput(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) {
    throw new InvalidInputError("Input must not be empty.");
  }
}

function isArrayBuffer(input: unknown): input is ArrayBuffer {
  return Object.prototype.toString.call(input) === "[object ArrayBuffer]";
}
