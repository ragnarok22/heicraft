import { execFile } from "node:child_process";
import { constants, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { InvalidInputError } from "../src/errors";
import { normalizeInput } from "../src/utils/input";

it.skipIf(process.platform === "win32")("rejects a FIFO without waiting for a writer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "heicraft-fifo-"));
  const fifo = join(directory, "input.heic");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<unknown> | undefined;
  try {
    await promisify(execFile)("mkfifo", [fifo]);
    pending = normalizeInput(fifo).catch((error: unknown) => error);
    const result = await Promise.race([
      pending,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(new Error("FIFO open blocked.")), 1_000);
      }),
    ]);
    expect(result).toBeInstanceOf(InvalidInputError);
  } finally {
    clearTimeout(timer);
    // Unblock a regressed blocking open so a failing test cannot strand a libuv thread.
    const writer = await open(fifo, constants.O_WRONLY | constants.O_NONBLOCK).catch(
      () => undefined,
    );
    await writer?.close();
    await pending;
    await rm(directory, { recursive: true, force: true });
  }
});
