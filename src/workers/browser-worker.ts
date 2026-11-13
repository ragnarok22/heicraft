import { executeRequest, responseTransfers } from "./execute";
import type { WorkerRequest, WorkerResponse } from "./protocol";

// Keep worker globals local instead of mixing the DOM and WebWorker TypeScript libraries.
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<WorkerRequest>) => void;
  postMessage: (response: WorkerResponse, transfers: ArrayBuffer[]) => void;
};
scope.onmessage = async ({ data }) => {
  const response = await executeRequest(data);
  scope.postMessage(response, responseTransfers(response));
};
