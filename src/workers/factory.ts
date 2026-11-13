import { UnsupportedFormatError } from "../errors";
import { isNodeEnvironment } from "../utils/environment";
import type { DecoderWorker } from "./pool";

export async function createDecoderWorker(): Promise<DecoderWorker> {
  if (isNodeEnvironment()) {
    const { createNodeWorker } = await import("./node");
    return createNodeWorker();
  }
  if (typeof Worker === "undefined") {
    throw new UnsupportedFormatError("HEIC decoding requires Web Worker support.");
  }
  const worker = new Worker(new URL("./browser-worker.js", import.meta.url), { type: "module" });
  return {
    postMessage: (request, transfers) => worker.postMessage(request, transfers),
    terminate: async () => worker.terminate(),
    listen(onMessage, onFailure) {
      const message = (event: MessageEvent) => onMessage(event.data);
      const error = (event: ErrorEvent) => {
        event.preventDefault();
        onFailure(new Error(event.message || "HEIC decoder worker failed to load."));
      };
      const messageError = () => onFailure(new Error("Invalid HEIC decoder worker message."));
      worker.addEventListener("message", message);
      worker.addEventListener("error", error);
      worker.addEventListener("messageerror", messageError);
      return () => {
        worker.removeEventListener("message", message);
        worker.addEventListener("error", preventRetiredWorkerError);
        worker.removeEventListener("error", error);
        worker.removeEventListener("messageerror", messageError);
      };
    },
  };
}

function preventRetiredWorkerError(event: Event): void {
  event.preventDefault();
}
