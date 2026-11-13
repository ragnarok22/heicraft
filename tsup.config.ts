import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "browser/fs-promises": "src/browser/fs-promises.ts",
      "browser/sharp": "src/browser/sharp.ts",
      "browser/worker-threads": "src/browser/worker-threads.ts",
      "node-worker": "src/workers/node-worker.ts",
    },
    format: ["esm"],
    target: "es2022",
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    external: [
      "libheif-js/wasm-bundle.js",
      "sharp",
      "node:fs/promises",
      "node:module",
      "node:worker_threads",
    ],
  },
  {
    entry: { "browser-worker": "src/workers/browser-worker.ts" },
    format: ["esm"],
    platform: "browser",
    target: "es2022",
    sourcemap: true,
    splitting: false,
    noExternal: ["libheif-js"],
    banner: {
      js: "/*! Includes libheif-js (LGPL-3.0): https://github.com/catdad-experiments/libheif-js — see THIRD_PARTY_NOTICES.md. */",
    },
  },
]);
