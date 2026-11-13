import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AbortError,
  ConversionError,
  InvalidInputError,
  ResourceLimitError,
  UnsupportedFormatError,
} from "../src/errors";
import { createDecoderWorker } from "../src/workers/factory";
import { executeRequest, responseTransfers } from "../src/workers/execute";
import { deserializeError } from "../src/workers/protocol";
import type { WorkerRequest } from "../src/workers/protocol";

const core = vi.hoisted(() => ({ decodeHeic: vi.fn(), readHeicMetadata: vi.fn() }));
vi.mock("../src/decoder-core.ts", () => core);
vi.mock("../src/utils/environment", () => ({ isNodeEnvironment: () => false }));

const request: WorkerRequest = {
  id: 7,
  operation: "decode",
  bytes: new Uint8Array([1]),
  maxPixels: 10,
};

class BrowserWorker extends EventTarget {
  static latest: BrowserWorker;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor(
    public url: URL,
    public options: WorkerOptions,
  ) {
    super();
    BrowserWorker.latest = this;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("worker wire protocol", () => {
  it("returns transferable pixels but no transferables for metadata", async () => {
    const decoded = { width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) };
    core.decodeHeic.mockResolvedValue(decoded);
    const response = await executeRequest(request);
    expect(core.decodeHeic).toHaveBeenCalledWith(request.bytes, 10);
    expect(response).toEqual({ id: 7, ok: true, result: decoded });
    expect(responseTransfers(response)).toEqual([decoded.data.buffer]);
    core.readHeicMetadata.mockResolvedValue({ width: 1, height: 1, hasAlpha: false });
    const metadata = await executeRequest({
      ...request,
      operation: "metadata",
      inspectAlpha: true,
    });
    expect(core.readHeicMetadata).toHaveBeenCalledWith(request.bytes, 10, true);
    expect(responseTransfers(metadata)).toEqual([]);
  });

  it.each([
    [new ResourceLimitError("too large"), "RESOURCE_LIMIT_EXCEEDED", "too large"],
    [new Error("decode failed"), "CONVERSION_ERROR", "decode failed"],
    ["unknown failure", "CONVERSION_ERROR", "HEIC decoding failed."],
  ])("serializes a backend failure (%s)", async (error, code, message) => {
    core.decodeHeic.mockRejectedValue(error);
    const response = await executeRequest(request);
    expect(response).toEqual({ id: 7, ok: false, error: { code, message } });
    expect(responseTransfers(response)).toEqual([]);
  });

  it.each([
    ["ABORT_ERROR", AbortError],
    ["INVALID_INPUT", InvalidInputError],
    ["RESOURCE_LIMIT_EXCEEDED", ResourceLimitError],
    ["UNSUPPORTED_FORMAT", UnsupportedFormatError],
    ["CONVERSION_ERROR", ConversionError],
    ["unrecognized", ConversionError],
  ])("reconstructs %s on the calling thread", (code, ErrorType) => {
    const error = deserializeError({ code, message: "failure" });
    expect(error).toBeInstanceOf(ErrorType);
    expect(error.message).toBe("failure");
  });
});

describe("browser worker transport", () => {
  it("reports unavailable workers rather than falling back to the main thread", async () => {
    vi.stubGlobal("Worker", undefined);
    await expect(createDecoderWorker()).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it("forwards transfers, handles worker failures, and detaches listeners", async () => {
    vi.stubGlobal("Worker", BrowserWorker);
    const worker = await createDecoderWorker();
    const native = BrowserWorker.latest;
    expect(native.url.pathname).toMatch(/browser-worker\.js$/);
    expect(native.options).toEqual({ type: "module" });
    const onMessage = vi.fn();
    const onFailure = vi.fn();
    const cleanup = worker.listen(onMessage, onFailure);
    worker.postMessage(request, [request.bytes.buffer as ArrayBuffer]);
    expect(native.postMessage).toHaveBeenCalledWith(request, [request.bytes.buffer]);
    const response = { id: 7, ok: true, result: { width: 1 } };
    native.dispatchEvent(new MessageEvent("message", { data: response }));
    expect(onMessage).toHaveBeenCalledWith(response);
    const error = new Event("error", { cancelable: true });
    Object.assign(error, { message: "CSP blocked worker" });
    native.dispatchEvent(error);
    expect(error.defaultPrevented).toBe(true);
    expect(onFailure).toHaveBeenCalledWith(new Error("CSP blocked worker"));
    native.dispatchEvent(new Event("error", { cancelable: true }));
    expect(onFailure).toHaveBeenLastCalledWith(new Error("HEIC decoder worker failed to load."));
    native.dispatchEvent(new Event("messageerror"));
    expect(onFailure).toHaveBeenLastCalledWith(new Error("Invalid HEIC decoder worker message."));
    cleanup();
    native.dispatchEvent(new MessageEvent("message", { data: response }));
    expect(onMessage).toHaveBeenCalledOnce();
    const lateError = new Event("error", { cancelable: true });
    native.dispatchEvent(lateError);
    expect(lateError.defaultPrevented).toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(3);
    await worker.terminate();
    expect(native.terminate).toHaveBeenCalledOnce();
  });

  it("posts a browser worker response with the RGBA transfer list", async () => {
    vi.stubGlobal("onmessage", undefined);
    const postMessage = vi.fn();
    vi.stubGlobal("postMessage", postMessage);
    const decoded = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
    core.decodeHeic.mockResolvedValue(decoded);
    await import("../src/workers/browser-worker");
    const scope = globalThis as unknown as {
      onmessage(event: MessageEvent<WorkerRequest>): Promise<void>;
    };
    await scope.onmessage(new MessageEvent("message", { data: request }));
    expect(postMessage).toHaveBeenCalledWith({ id: 7, ok: true, result: decoded }, [
      decoded.data.buffer,
    ]);
  });
});
