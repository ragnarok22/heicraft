import { describe, expect, it } from "vitest";
import { open } from "../src/browser/fs-promises";
import sharpBrowserStub from "../src/browser/sharp";
import { Worker } from "../src/browser/worker-threads";

describe("browser dependency shims", () => {
  it("reports Node.js dependencies as unavailable", async () => {
    expect(() => sharpBrowserStub()).toThrowError("sharp is not available in browser builds.");
    expect(() => Worker()).toThrowError("node:worker_threads is not available in browser builds.");
    await expect(open()).rejects.toThrowError(
      "node:fs/promises is not available in browser builds.",
    );
  });
});
