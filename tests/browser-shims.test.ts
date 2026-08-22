import { describe, expect, it } from "vitest";
import { readFile } from "../src/browser/fs-promises";
import sharpBrowserStub from "../src/browser/sharp";

describe("browser dependency shims", () => {
  it("reports Node.js dependencies as unavailable", async () => {
    expect(() => sharpBrowserStub()).toThrowError("sharp is not available in browser builds.");
    await expect(readFile()).rejects.toThrowError(
      "node:fs/promises is not available in browser builds.",
    );
  });
});
