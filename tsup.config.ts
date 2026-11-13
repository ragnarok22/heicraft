import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "browser/fs-promises": "src/browser/fs-promises.ts",
    "browser/sharp": "src/browser/sharp.ts",
  },
  format: ["esm"],
  target: "es2022",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ["libheif-js/wasm-bundle.js", "sharp", "node:fs/promises", "node:module"],
});
