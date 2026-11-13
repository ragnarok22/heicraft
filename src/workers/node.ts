import { Worker } from "node:worker_threads";
import type { DecoderWorker } from "./pool";

export function createNodeWorker(
  url = new URL(
    import.meta.url.endsWith(".ts") ? "./node-worker.ts" : "./node-worker.js",
    import.meta.url,
  ),
): DecoderWorker {
  // Native type stripping also permits running the source adapter in development.
  const source = url.pathname.endsWith(".ts");
  const execArgv = process.execArgv.filter((arg) => !arg.startsWith("--input-type"));
  if (source) execArgv.push("--experimental-strip-types");
  const worker = new Worker(url, { execArgv });
  return {
    postMessage: (request, transfers) => worker.postMessage(request, transfers),
    terminate: () => worker.terminate(),
    ref: () => worker.ref(),
    unref: () => worker.unref(),
    listen(onMessage, onFailure) {
      const exit = (code: number) => onFailure(new Error(`HEIC decoder worker exited (${code}).`));
      const messageError = () => onFailure(new Error("Invalid HEIC decoder worker message."));
      worker.on("message", onMessage);
      worker.on("error", onFailure);
      worker.on("exit", exit);
      worker.on("messageerror", messageError);
      return () => {
        worker.off("message", onMessage);
        // A pending error event may arrive after cancellation removed the job listeners.
        worker.on("error", ignoreRetiredWorkerError);
        worker.off("error", onFailure);
        worker.off("exit", exit);
        worker.off("messageerror", messageError);
      };
    },
  };
}

function ignoreRetiredWorkerError(): void {}
