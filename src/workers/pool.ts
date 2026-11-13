import {
  AbortError,
  ResourceLimitError,
  UnsupportedFormatError,
  WorkerError,
  throwIfAborted,
} from "../errors";
import { prepareInputTransfer } from "../utils/ownership";
import {
  type DecodeRequest,
  deserializeError,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerResult,
} from "./protocol";

export interface DecoderWorker {
  postMessage(request: WorkerRequest, transfers: ArrayBuffer[]): void;
  listen(
    onMessage: (response: WorkerResponse) => void,
    onFailure: (error: Error) => void,
  ): () => void;
  terminate(): Promise<unknown>;
  ref?(): void;
  unref?(): void;
}

type Job = {
  request: DecodeRequest;
  id: number;
  resolve: (result: WorkerResult) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  cleanup: () => void;
};
type Slot = {
  worker?: DecoderWorker;
  job?: Job;
  retiring: boolean;
  cleanup?: () => void;
  retirement?: Promise<void>;
  idleTimer?: ReturnType<typeof setTimeout>;
};

/** One job per worker, so terminating an active job never cancels a neighbour. */
export class DecoderPool {
  private readonly slots = new Set<Slot>();
  private readonly queue: Job[] = [];
  private nextId = 0;

  constructor(
    private readonly createWorker: () => Promise<DecoderWorker>,
    private readonly maxWorkers: number,
    private readonly maxQueue: number,
    private readonly idleTimeoutMs = 30_000,
  ) {}

  run(request: DecodeRequest, signal?: AbortSignal): Promise<WorkerResult> {
    throwIfAborted(signal);
    const available = [...this.slots].some((slot) => !slot.job && !slot.retiring);
    if (!available && this.slots.size >= this.maxWorkers && this.queue.length >= this.maxQueue) {
      return Promise.reject(new ResourceLimitError("HEIC decoder queue is full."));
    }
    return new Promise((resolve, reject) => {
      const job: Job = {
        request,
        id: ++this.nextId,
        resolve,
        reject,
        signal,
        cleanup: () => signal?.removeEventListener("abort", abort),
      };
      const abort = () => {
        const index = this.queue.indexOf(job);
        if (index !== -1) {
          this.queue.splice(index, 1);
          job.cleanup();
          job.reject(new AbortError());
          return;
        }
        const slot = [...this.slots].find((candidate) => candidate.job === job);
        if (slot) this.retire(slot, new AbortError());
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.queue.push(job);
      this.dispatch();
    });
  }

  private dispatch(): void {
    while (this.queue.length > 0) {
      let slot = [...this.slots].find((candidate) => !candidate.job && !candidate.retiring);
      if (!slot) {
        if (this.slots.size >= this.maxWorkers) return;
        slot = { retiring: false };
        this.slots.add(slot);
      }
      const job = this.queue.shift();
      if (!job) return;
      clearTimeout(slot.idleTimer);
      slot.idleTimer = undefined;
      slot.job = job;
      void this.start(slot, job);
    }
  }

  private async start(slot: Slot, job: Job): Promise<void> {
    try {
      if (!slot.worker) {
        const worker = await this.createWorker();
        slot.worker = worker;
        slot.cleanup = worker.listen(
          (response) => this.receive(slot, response),
          (error) => this.retire(slot, new WorkerError(error.message, { cause: error })),
        );
      }
      // An abort during asynchronous worker creation still has to terminate that worker.
      if (slot.retiring) return;
      throwIfAborted(job.signal);
      slot.worker.ref?.();
      const bytes = prepareInputTransfer(job.request.bytes);
      slot.worker.postMessage({ ...job.request, bytes, id: job.id }, [bytes.buffer]);
    } catch (error) {
      this.retire(
        slot,
        error instanceof AbortError || error instanceof UnsupportedFormatError
          ? error
          : new WorkerError(
              error instanceof Error ? error.message : "HEIC decoder worker failed.",
              { cause: error },
            ),
      );
    } finally {
      if (slot.retiring) await this.finishRetirement(slot);
    }
  }

  private receive(slot: Slot, response: WorkerResponse): void {
    const job = slot.job;
    if (!job || slot.retiring || response.id !== job.id) return;
    slot.job = undefined;
    job.cleanup();
    const error = response.ok ? undefined : deserializeError(response.error);
    if (error instanceof WorkerError) {
      job.reject(job.signal?.aborted ? new AbortError() : error);
      // A failed backend initialization can remain cached inside this worker.
      // Keep its reference until termination finishes, then recover queued work.
      this.retire(slot);
      return;
    }
    slot.worker?.unref?.();
    if (job.signal?.aborted) job.reject(new AbortError());
    else if (response.ok) job.resolve(response.result);
    else job.reject(error);
    this.dispatch();
    if (!slot.job && !slot.retiring) {
      slot.idleTimer = setTimeout(() => this.retire(slot), this.idleTimeoutMs);
      if (typeof slot.idleTimer === "object") slot.idleTimer.unref?.();
    }
  }

  private retire(slot: Slot, error?: unknown): void {
    if (slot.retiring) return;
    slot.retiring = true;
    clearTimeout(slot.idleTimer);
    slot.idleTimer = undefined;
    const job = slot.job;
    slot.job = undefined;
    job?.cleanup();
    job?.reject(error);
    // During creation, start() owns cleanup once the worker becomes available.
    if (slot.worker) void this.finishRetirement(slot);
  }

  private finishRetirement(slot: Slot): Promise<void> {
    slot.retirement ??= (async () => {
      slot.cleanup?.();
      slot.cleanup = undefined;
      const worker = slot.worker;
      slot.worker = undefined;
      try {
        await worker?.terminate();
      } catch {
        // Termination can race a worker that has already exited.
      } finally {
        this.slots.delete(slot);
        this.dispatch();
      }
    })();
    return slot.retirement;
  }
}
