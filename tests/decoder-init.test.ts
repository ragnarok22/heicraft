import { expect, it, vi } from "vitest";
import { ConversionError, WorkerError } from "../src/errors";
import { executeRequest } from "../src/workers/execute";
import { deserializeError } from "../src/workers/protocol";

vi.mock("libheif-js/wasm-bundle.js", () => {
  throw new Error("Decoder dependency is missing.");
});

it.each(["decode", "metadata"] as const)(
  "preserves backend initialization failures across worker serialization (%s)",
  async (operation) => {
    const response = structuredClone(
      await executeRequest({ id: 1, operation, bytes: new Uint8Array([1]) }),
    );
    if (response.ok) throw new Error("Expected initialization to fail.");
    const error = deserializeError(response.error);
    expect(error).toBeInstanceOf(WorkerError);
    expect(error).toBeInstanceOf(ConversionError);
    expect(error.code).toBe("CONVERSION_ERROR");
    expect(error.cause).toBeInstanceOf(Error);
  },
);
