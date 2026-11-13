import { parentPort } from "node:worker_threads";
import { executeRequest, responseTransfers } from "./execute.ts";
import type { WorkerRequest } from "./protocol";

if (!parentPort) {
  throw new Error("The HEIC decoder must run in a worker thread.");
}
const port = parentPort;
port.on("message", async (request: WorkerRequest) => {
  const response = await executeRequest(request);
  port.postMessage(response, responseTransfers(response));
});
