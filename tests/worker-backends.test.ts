import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AbortError,
  ConversionError,
  InvalidInputError,
  ResourceLimitError,
  UnsupportedFormatError,
} from "../src/errors";
import { executeRequest, responseTransfers } from "../src/workers/execute";
import { createDecoderWorker } from "../src/workers/factory";
import type { WorkerRequest } from "../src/workers/protocol";
import { deserializeError, serializeError } from "../src/workers/protocol";

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
    expect(response).toMatchObject({ id: 7, ok: false, error: { code, message } });
    expect(responseTransfers(response)).toEqual([]);
  });

  it("preserves decoder diagnostics across structured cloning", async () => {
    const cause = new TypeError("invalid payload", { cause: new Error("invalid header") });
    Object.assign(cause, { uncloneable: () => {} });
    core.decodeHeic.mockRejectedValue(cause);

    const response = structuredClone(await executeRequest(request));
    expect(response.ok).toBe(false);
    if (response.ok) throw new Error("Expected a decoder failure.");
    const error = deserializeError(response.error);

    expect(error).toBeInstanceOf(ConversionError);
    expect(error.message).toBe(cause.message);
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.cause).toMatchObject({
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
      cause: { name: "Error", message: "invalid header" },
    });
    expect(error.cause).not.toHaveProperty("uncloneable");
  });

  it("preserves typed worker errors, their stacks, and existing causes", () => {
    const original = new ResourceLimitError("too large", { cause: new Error("pixel limit") });
    const error = deserializeError(structuredClone(serializeError(original)));

    expect(error).toBeInstanceOf(ResourceLimitError);
    expect(error.stack).toBe(original.stack);
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.cause).toMatchObject({ message: "pixel limit" });
  });

  it("serializes non-Error failures without copying uncloneable values", () => {
    const original = { callback: () => {}, self: undefined as unknown };
    original.self = original;
    const error = deserializeError(structuredClone(serializeError(original)));

    expect(error).toBeInstanceOf(ConversionError);
    expect(error.message).toBe("HEIC decoding failed.");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("bounds cyclic and deeply nested cause chains", () => {
    const cyclic = new Error("cyclic");
    cyclic.cause = cyclic;
    const error = deserializeError(structuredClone(serializeError(cyclic)));

    expect(error.cause).toMatchObject({ message: "cyclic" });
    expect(error.cause).not.toHaveProperty("cause");

    let nested = new Error("root");
    for (let index = 0; index < 20; index++) {
      nested = new Error("nested", { cause: nested });
    }
    const restored = deserializeError(structuredClone(serializeError(nested)));
    let depth = 0;
    for (let cause = restored.cause; cause instanceof Error; cause = cause.cause) {
      depth++;
    }
    expect(depth).toBe(8);
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
