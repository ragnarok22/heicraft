import { ResourceLimitError, throwIfAborted } from "../errors";
import { isNodeEnvironment } from "../utils/environment";
import { createDecoderWorker } from "./factory";
import { DecoderPool } from "./pool";

const MAX_QUEUE = 8;
let pool: DecoderPool | undefined;
let admitted = 0;

export function getDecoderPool(): DecoderPool {
  pool ??= new DecoderPool(createDecoderWorker, isNodeEnvironment() ? 2 : 1, MAX_QUEUE);
  return pool;
}

/** Bound pending inputs before reading files or allocating an internal transfer buffer. */
export async function withDecodeAdmission<T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  if (admitted >= (isNodeEnvironment() ? 2 : 1) + MAX_QUEUE) {
    throw new ResourceLimitError("HEIC decoder queue is full.");
  }
  admitted++;
  try {
    return await task();
  } finally {
    admitted--;
  }
}
