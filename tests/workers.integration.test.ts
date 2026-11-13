import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { AbortError } from "../src";
import { createNodeWorker } from "../src/workers/node";
import { DecoderPool } from "../src/workers/pool";

describe("real worker interruption", () => {
  it("does not inherit parent CLI flags that are invalid for worker threads", async () => {
    const adapter = new URL("../src/workers/node.ts", import.meta.url).href;
    const workerURL = `data:text/javascript,${encodeURIComponent(`
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", () => {
        parentPort.postMessage({ id: 1, ok: true, result: { width: 1 } });
      });
    `)}`;
    const script = `
      import { createNodeWorker } from ${JSON.stringify(adapter)};
      const worker = createNodeWorker(new URL(${JSON.stringify(workerURL)}));
      try {
        await new Promise((resolve, reject) => {
          worker.listen(resolve, reject);
          worker.postMessage({ id: 1, operation: "metadata", bytes: new Uint8Array([1]) }, []);
        });
        console.log("worker-ok");
      } finally {
        await worker.terminate();
      }
    `;
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        "--experimental-strip-types",
        "--max-old-space-size=128",
        "--input-type",
        "module",
        "-e",
        script,
      ],
      { timeout: 5_000 },
    );
    expect(stdout.trim()).toBe("worker-ok");
  });

  it.each(["throw new Error('crashed')", "process.exit(0)"])(
    "reports a worker that exits before replying (%s)",
    async (failure) => {
      const url = new URL(
        `data:text/javascript,${encodeURIComponent(`
        import { parentPort } from "node:worker_threads";
        parentPort.on("message", () => { ${failure} });
      `)}`,
      );
      const pool = new DecoderPool(async () => createNodeWorker(url), 1, 1);
      await expect(
        pool.run({ operation: "decode", bytes: new Uint8Array([1]) }),
      ).rejects.toMatchObject({ code: "CONVERSION_ERROR" });
    },
  );

  it("interrupts synchronous work without blocking the caller and then decodes another image", async () => {
    const fixture = await readFile(new URL("./fixtures/pattern.heic", import.meta.url));
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let first = true;
    const pool = new DecoderPool(
      async () => {
        if (!first) return createNodeWorker();
        first = false;
        const url = new URL(
          `data:text/javascript,${encodeURIComponent(`
        import { parentPort } from "node:worker_threads";
        parentPort.on("message", () => {
          parentPort.postMessage({ id: -1, ok: true, result: {} });
          while (true) {}
        });
      `)}`,
        );
        const worker = createNodeWorker(url);
        const listen = worker.listen;
        worker.listen = (onMessage, onFailure) =>
          listen((response) => {
            if (response.id === -1) started();
            else onMessage(response);
          }, onFailure);
        return worker;
      },
      1,
      1,
    );
    const controller = new AbortController();
    const job = pool.run({ operation: "decode", bytes: fixture }, controller.signal);
    const assertion = expect(job).rejects.toBeInstanceOf(AbortError);
    try {
      await ready;
      // The worker is synchronously busy: a cancellation message could never be handled.
      controller.abort();
      await assertion;
      await expect(pool.run({ operation: "decode", bytes: fixture })).resolves.toMatchObject({
        width: 32,
        height: 32,
        data: expect.any(Uint8ClampedArray),
      });
    } finally {
      controller.abort();
    }
  });
});
