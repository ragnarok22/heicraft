import { describe, expect, it, vi } from "vitest";
import { AbortError, ConversionError, ResourceLimitError } from "../src";
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
    const assertion = expect(failing).rejects.toBeInstanceOf(ConversionError);
    await crashed.posted.promise;
    crashed.onFailure?.(new Error("worker crashed"));
    await assertion;
    const next = pool.run(request);
    await recovered.posted.promise;
    recovered.complete();
    await next;
    expect(posting.terminate).toHaveBeenCalledOnce();
    expect(crashed.terminate).toHaveBeenCalledOnce();
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

  it("does not create a worker for an already-aborted signal", () => {
    const create = vi.fn();
    const pool = new DecoderPool(create, 1, 1);
    const controller = new AbortController();
    controller.abort();
    expect(() => pool.run(request, controller.signal)).toThrow(AbortError);
    expect(create).not.toHaveBeenCalled();
  });
});
