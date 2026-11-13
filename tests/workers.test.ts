import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AbortError, ConversionError, ResourceLimitError } from "../src";
import { WorkerError } from "../src/errors";
import { normalizeInput } from "../src/utils/input";
import { ownInput } from "../src/utils/ownership";
import { DecoderPool, type DecoderWorker } from "../src/workers/pool";
import type { WorkerRequest, WorkerResponse } from "../src/workers/protocol";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

class TestWorker implements DecoderWorker {
  requests: WorkerRequest[] = [];
  posted = deferred();
  onMessage?: (response: WorkerResponse) => void;
  onFailure?: (error: Error) => void;
  cleanup = vi.fn(() => {
    this.onMessage = undefined;
    this.onFailure = undefined;
  });
  terminate = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  ref = vi.fn();
  unref = vi.fn();

  postMessage(request: WorkerRequest, transfers: ArrayBuffer[]) {
    this.requests.push(structuredClone(request, { transfer: transfers }));
    this.posted.resolve();
  }

  listen(onMessage: (response: WorkerResponse) => void, onFailure: (error: Error) => void) {
    this.onMessage = onMessage;
    this.onFailure = onFailure;
    return this.cleanup;
  }

  complete() {
    this.onMessage?.({
      id: this.requests.at(-1)?.id ?? -1,
      ok: true,
      result: { width: 1, height: 1 },
    });
  }
}

const request = { operation: "metadata", bytes: new Uint8Array([1, 2, 3]) } as const;

describe("bounded decoder workers", () => {
  it.each([false, true])(
    "transfers internally allocated Blob input without copying (signal: %s)",
    async (cancellable) => {
      const signal = cancellable ? new AbortController().signal : undefined;
      const input = await normalizeInput(new Blob([new Uint8Array([1, 2, 3])]), { signal });
      const worker = new TestWorker();
      const pool = new DecoderPool(async () => worker, 1, 1);
      const job = pool.run({ ...request, bytes: input.bytes });
      await worker.posted.promise;
      expect(input.bytes.byteLength).toBe(0);
      expect([...worker.requests[0].bytes]).toEqual([1, 2, 3]);
      worker.complete();
      await job;
    },
  );

  it("does not detach buffers returned by user-supplied Blob overrides", async () => {
    const backing = new Uint8Array([1, 2, 3]);
    class BorrowedBlob extends Blob {
      override async arrayBuffer() {
        return backing.buffer;
      }
    }
    const input = await normalizeInput(new BorrowedBlob([backing]));
    const worker = new TestWorker();
    const pool = new DecoderPool(async () => worker, 1, 1);
    const job = pool.run({ ...request, bytes: input.bytes });
    await worker.posted.promise;
    expect([...backing]).toEqual([1, 2, 3]);
    worker.complete();
    await job;
  });

  it.each([
    [1, 4],
    [0, 3],
  ])("never transfers bytes outside an owned input view (%i, %i)", async (start, end) => {
    const backing = new Uint8Array([9, 1, 2, 3, 8]);
    const input = ownInput(backing.subarray(start, end));
    const worker = new TestWorker();
    const pool = new DecoderPool(async () => worker, 1, 1);
    const job = pool.run({ ...request, bytes: input });
    await worker.posted.promise;
    expect([...backing]).toEqual([9, 1, 2, 3, 8]);
    expect([...worker.requests[0].bytes]).toEqual([...backing.subarray(start, end)]);
    worker.complete();
    await job;
  });

  it.each([false, true])(
    "transfers file-read buffers without a worker-side copy (signal: %s)",
    async (cancellable) => {
      const directory = await mkdtemp(join(tmpdir(), "heicraft-owned-"));
      try {
        const path = join(directory, "input.heic");
        await writeFile(path, new Uint8Array([1, 2, 3]));
        const input = await normalizeInput(path, {
          signal: cancellable ? new AbortController().signal : undefined,
        });
        const worker = new TestWorker();
        const pool = new DecoderPool(async () => worker, 1, 1);
        const job = pool.run({ ...request, bytes: input.bytes });
        await worker.posted.promise;
        expect(input.bytes.byteLength).toBe(0);
        expect([...worker.requests[0].bytes]).toEqual([1, 2, 3]);
        worker.complete();
        await job;
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it("bounds workers and queued work, reuses idle workers, and preserves input views", async () => {
    const workers: TestWorker[] = [];
    const create = vi.fn(async () => {
      const worker = new TestWorker();
      workers.push(worker);
      return worker;
    });
    const pool = new DecoderPool(create, 2, 1);
    const input = Buffer.from([9, 1, 2, 3, 8]).subarray(1, 4);
    const first = pool.run({ ...request, bytes: input });
    const second = pool.run(request);
    const third = pool.run(request);
    await expect(pool.run(request)).rejects.toBeInstanceOf(ResourceLimitError);
    await Promise.all(workers.map((worker) => worker.posted.promise));
    expect(create).toHaveBeenCalledTimes(2);
    expect([...workers[0].requests[0].bytes]).toEqual([1, 2, 3]);
    expect([...input]).toEqual([1, 2, 3]);
    expect(input.buffer.byteLength).toBeGreaterThan(0);
    workers[0].complete();
    expect(workers[0].requests).toHaveLength(2);
    workers[0].complete();
    workers[1].complete();
    await Promise.all([first, second, third]);
    expect(workers[0].unref).toHaveBeenCalledTimes(2);
    expect(workers[0].terminate).not.toHaveBeenCalled();
  });

  it("removes queued cancellations without terminating another job", async () => {
    const worker = new TestWorker();
    const create = vi.fn(async () => worker);
    const pool = new DecoderPool(create, 1, 1);
    const first = pool.run(request);
    await worker.posted.promise;
    const controller = new AbortController();
    const queued = pool.run(request, controller.signal);
    const assertion = expect(queued).rejects.toBeInstanceOf(AbortError);
    controller.abort();
    await assertion;
    const replacement = pool.run(request);
    worker.complete();
    worker.complete();
    await Promise.all([first, replacement]);
    expect(create).toHaveBeenCalledOnce();
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("rejects active cancellation promptly but waits for termination before replacement", async () => {
    const worker = new TestWorker();
    const termination = deferred();
    worker.terminate.mockReturnValue(termination.promise);
    const replacement = new TestWorker();
    const created = deferred();
    const create = vi.fn(async () => {
      if (create.mock.calls.length === 1) return worker;
      created.resolve();
      return replacement;
    });
    const pool = new DecoderPool(create, 1, 1);
    const controller = new AbortController();
    const active = pool.run(request, controller.signal);
    const assertion = expect(active).rejects.toBeInstanceOf(AbortError);
    await worker.posted.promise;
    const lateMessage = worker.onMessage;
    const queued = pool.run(request);
    controller.abort();
    await assertion;
    lateMessage?.({ id: worker.requests[0].id, ok: true, result: { width: 99 } });
    expect(create).toHaveBeenCalledOnce();
    expect(worker.cleanup).toHaveBeenCalledOnce();
    termination.resolve();
    await created.promise;
    await replacement.posted.promise;
    replacement.complete();
    await expect(queued).resolves.toEqual({ width: 1, height: 1 });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates a worker created after cancellation without posting the cancelled job", async () => {
    const creation = deferred<DecoderWorker>();
    const worker = new TestWorker();
    const replacement = new TestWorker();
    const pool = new DecoderPool(
      vi.fn().mockReturnValueOnce(creation.promise).mockResolvedValue(replacement),
      1,
      1,
    );
    const controller = new AbortController();
    const active = pool.run(request, controller.signal);
    const assertion = expect(active).rejects.toBeInstanceOf(AbortError);
    const queued = pool.run(request);
    controller.abort();
    await assertion;
    creation.resolve(worker);
    await replacement.posted.promise;
    expect(worker.requests).toHaveLength(0);
    expect(worker.terminate).toHaveBeenCalledOnce();
    replacement.complete();
    await queued;
  });

  it("recovers from creation, posting, and runtime failures", async () => {
    const posting = new TestWorker();
    vi.spyOn(posting, "postMessage").mockImplementation(() => {
      throw new Error("post failed");
    });
    const crashed = new TestWorker();
    const recovered = new TestWorker();
    const pool = new DecoderPool(
      vi
        .fn()
        .mockRejectedValueOnce(new ConversionError("load failed"))
        .mockResolvedValueOnce(posting)
        .mockResolvedValueOnce(crashed)
        .mockResolvedValue(recovered),
      1,
      2,
    );
    await expect(pool.run(request)).rejects.toThrow("load failed");
    await expect(pool.run(request)).rejects.toThrow("post failed");
    const failing = pool.run(request);
    const cause = new Error("worker crashed");
    const assertion = expect(failing).rejects.toMatchObject({
      name: "WorkerError",
      cause,
    });
    await crashed.posted.promise;
    crashed.onFailure?.(cause);
    await assertion;
    const next = pool.run(request);
    await recovered.posted.promise;
    recovered.complete();
    await next;
    expect(posting.terminate).toHaveBeenCalledOnce();
    expect(crashed.terminate).toHaveBeenCalledOnce();
  });

  it("releases idle workers, cancels their idle timers on reuse, and recreates them", async () => {
    vi.useFakeTimers();
    try {
      const first = new TestWorker();
      const second = new TestWorker();
      const create = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
      const pool = new DecoderPool(create, 1, 1, 100);
      const initial = pool.run(request);
      await first.posted.promise;
      first.complete();
      await initial;
      await vi.advanceTimersByTimeAsync(50);
      const reused = pool.run(request);
      await vi.advanceTimersByTimeAsync(100);
      expect(first.terminate).not.toHaveBeenCalled();
      first.complete();
      await reused;
      await vi.advanceTimersByTimeAsync(100);
      expect(first.terminate).toHaveBeenCalledOnce();
      const replacement = pool.run(request);
      await second.posted.promise;
      second.complete();
      await replacement;
      await vi.advanceTimersByTimeAsync(100);
      expect(second.terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("classifies creation failures as worker errors, not image parsing failures", async () => {
    const cause = new Error("Missing worker asset");
    const pool = new DecoderPool(
      async () => {
        throw cause;
      },
      1,
      1,
    );
    const result = pool.run(request);
    await expect(result).rejects.toBeInstanceOf(WorkerError);
    await expect(result).rejects.toBeInstanceOf(ConversionError);
    await expect(result).rejects.toMatchObject({ cause });
  });

  it("rehydrates typed errors without discarding a healthy worker", async () => {
    const worker = new TestWorker();
    const pool = new DecoderPool(async () => worker, 1, 1);
    const job = pool.run(request);
    const assertion = expect(job).rejects.toBeInstanceOf(ResourceLimitError);
    await worker.posted.promise;
    worker.onMessage?.({
      id: worker.requests[0].id,
      ok: false,
      error: { code: "RESOURCE_LIMIT_EXCEEDED", message: "Too many pixels." },
    });
    await assertion;
    const next = pool.run(request);
    worker.complete();
    await next;
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("replaces a worker whose backend failed initialization before dispatching queued work", async () => {
    const broken = new TestWorker();
    const replacement = new TestWorker();
    const pool = new DecoderPool(
      vi.fn().mockResolvedValueOnce(broken).mockResolvedValueOnce(replacement),
      1,
      1,
    );
    const first = pool.run(request);
    const assertion = expect(first).rejects.toBeInstanceOf(WorkerError);
    await broken.posted.promise;
    const next = pool.run(request);
    broken.onMessage?.({
      id: broken.requests[0].id,
      ok: false,
      error: {
        code: "CONVERSION_ERROR",
        workerFailure: true,
        message: "Unable to initialize the decoder.",
      },
    });
    await assertion;
    await replacement.posted.promise;
    expect(broken.terminate).toHaveBeenCalledOnce();
    replacement.complete();
    await next;
  });

  it("does not create a worker for an already-aborted signal", () => {
    const create = vi.fn();
    const pool = new DecoderPool(create, 1, 1);
    const controller = new AbortController();
    controller.abort();
    expect(() => pool.run(request, controller.signal)).toThrow(AbortError);
    expect(create).not.toHaveBeenCalled();
  });
});
