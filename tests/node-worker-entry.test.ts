import { afterEach, expect, it, vi } from "vitest";

const port = vi.hoisted(() => ({ on: vi.fn(), postMessage: vi.fn() }));
const execute = vi.hoisted(() => vi.fn());
vi.mock("node:worker_threads", () => ({ parentPort: port }));
vi.mock("../src/workers/execute.ts", async () => ({
  executeRequest: execute,
  responseTransfers: () => [],
}));

afterEach(() => {
  vi.resetModules();
});

it("bridges node worker requests and responses", async () => {
  await import("../src/workers/node-worker");
  const request = { id: 1, operation: "metadata", bytes: new Uint8Array([1]) };
  const response = { id: 1, ok: true, result: { width: 1 } };
  execute.mockResolvedValue(response);
  const [event, handler] = port.on.mock.calls[0];
  expect(event).toBe("message");
  await handler(request);
  expect(execute).toHaveBeenCalledWith(request);
  expect(port.postMessage).toHaveBeenCalledWith(response, []);
});

it("does not run the node worker entry on the calling thread", async () => {
  vi.doMock("node:worker_threads", () => ({ parentPort: null }));
  await expect(import("../src/workers/node-worker")).rejects.toThrow(
    "The HEIC decoder must run in a worker thread.",
  );
});
