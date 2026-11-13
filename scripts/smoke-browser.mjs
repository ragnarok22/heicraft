import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium, webkit } from "playwright";
import sharp from "sharp";
import { build, preview } from "vite";

const projectRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const browserName = process.argv[2] ?? "chromium";
const engine = { chromium, webkit }[browserName];
if (!engine) throw new Error(`Unknown smoke browser: ${browserName}. Use chromium or webkit.`);
const fixture = await readFile(new URL("../tests/fixtures/pattern.heic", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "heicraft-browser-"));
let server;
let browser;
let conversionTimeout;
let convertHeic;

try {
  const packageRoot = await unpackPackage();
  ({ convertHeic } = await import(pathToFileURL(join(packageRoot, "dist/index.js")).href));
  await writeFile(
    join(directory, "index.js"),
    'import { convertHeic, detectHeic, getHeicInfo } from "heicraft"; Object.assign(window, { __heicraftConvertHeic: convertHeic, __heicraftDetectHeic: detectHeic, __heicraftGetHeicInfo: getHeicInfo });\n',
  );

  await writeFile(
    join(directory, "index.html"),
    '<script type="module" src="/index.js"></script>\n',
  );
  await mkdir(join(directory, "node_modules"));
  await symlink(packageRoot, join(directory, "node_modules", "heicraft"), "dir");

  await checkDetectionBundle();
  const outputDirectory = join(directory, "dist");
  await build({
    root: directory,
    configFile: false,
    logLevel: "silent",
    build: {
      emptyOutDir: true,
      outDir: outputDirectory,
      rollupOptions: {
        input: join(directory, "index.html"),
      },
    },
  });

  const scripts = await collectJavaScriptFiles(outputDirectory);
  if (scripts.length === 0) {
    throw new Error("Browser smoke test could not find bundled JavaScript.");
  }

  const forbidden = ["sharp/lib", "@img/sharp", "browser-external:node:"];
  for (const script of scripts) {
    const contents = await readFile(script, "utf8");
    const match = forbidden.find((text) => contents.includes(text));
    if (match) {
      throw new Error(`Browser bundle ${script} includes ${match}.`);
    }
  }

  server = await preview({
    root: directory,
    configFile: false,
    logLevel: "silent",
    build: { outDir: outputDirectory },
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  browser = await engine.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__workerStats = { created: 0, posted: 0, terminated: 0 };
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        window.__workerStats.created++;
      }
      postMessage(...args) {
        super.postMessage(...args);
        window.__workerStats.posted++;
        if (window.__abortOnPost) queueMicrotask(window.__abortOnPost);
      }
      terminate() {
        window.__workerStats.terminated++;
        super.terminate();
      }
    };
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => typeof window.__heicraftConvertHeic === "function");

  await Promise.race([
    (async () => {
      await checkConversions(page);
      assert.deepEqual(
        await page.evaluate(() => window.__workerStats),
        { created: 1, posted: 3, terminated: 0 },
        "Browser conversions must reuse a real decoder worker.",
      );
      await checkWorkerCancellation(page);
      await checkBrowserEncodingPaths(page);
      await checkOrientedAlpha(page);
      await checkCrossRealmInputs(page);
    })(),
    new Promise((_, reject) => {
      conversionTimeout = setTimeout(
        () => reject(new Error("Real conversion smoke test timed out after 60 seconds.")),
        60_000,
      );
    }),
  ]);
  assert.deepEqual(pageErrors, [], "Browser smoke test encountered uncaught page errors.");
} finally {
  clearTimeout(conversionTimeout);
  try {
    await browser?.close();
  } finally {
    try {
      await server?.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

async function unpackPackage() {
  const run = promisify(execFile);
  const { stdout } = await run(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", directory],
    { cwd: projectRoot },
  );
  const [packed] = JSON.parse(stdout);
  const files = new Set(packed.files.map((file) => file.path));
  for (const required of [
    "dist/index.js",
    "dist/index.d.ts",
    "dist/detect.js",
    "dist/detect.d.ts",
    "dist/node-worker.js",
    "dist/browser-worker.js",
    "dist/libheif-js.LICENSE",
  ]) {
    assert.ok(files.has(required), `Published package is missing ${required}.`);
  }
  await run("tar", ["-xzf", join(directory, packed.filename), "-C", directory]);
  const packageRoot = join(directory, "package");
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  await mkdir(join(packageRoot, "node_modules"));
  // Reuse installed dependencies offline, but never resolve heicraft's own files
  // from the source tree: both runtimes execute the actual npm tarball.
  for (const dependency of Object.keys(manifest.dependencies)) {
    await symlink(
      join(projectRoot, "node_modules", dependency),
      join(packageRoot, "node_modules", dependency),
      "dir",
    );
  }
  console.log(`Testing npm artifact ${packed.filename}.`);
  return packageRoot;
}

async function checkDetectionBundle() {
  await writeFile(
    join(directory, "detect.js"),
    'import { isHeic } from "heicraft/detect"; window.__heicraftIsHeic = isHeic;\n',
  );
  await writeFile(
    join(directory, "detect.html"),
    '<script type="module" src="/detect.js"></script>\n',
  );
  const result = await build({
    root: directory,
    configFile: false,
    logLevel: "silent",
    build: { write: false, rollupOptions: { input: join(directory, "detect.html") } },
  });
  let bytes = 0;
  for (const file of result.output) {
    if (!file.fileName.endsWith(".js")) continue;
    const code = file.type === "chunk" ? file.code : String(file.source);
    assert.ok(!file.fileName.includes("worker"), "Detection must not emit a worker asset.");
    assert.ok(!code.includes("libheif"), "Detection must not bundle the decoder.");
    assert.ok(!code.includes("browser-worker"), "Detection must not reference a worker.");
    bytes += Buffer.byteLength(code);
  }
  assert.ok(bytes > 0, "Could not find the detection bundle.");
  console.log(`Detection-only bundle: ${bytes} bytes, no decoder or worker assets.`);
}

async function checkCrossRealmInputs(page) {
  await page.evaluate(async (bytes) => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    try {
      const realm = frame.contentWindow;
      const file = new realm.File([new Uint8Array(bytes)], "iframe.heic", { type: "image/heic" });
      const blob = new realm.Blob([new Uint8Array(bytes)], { type: "image/heic" });
      if (file instanceof File || blob instanceof Blob) {
        throw new Error("The test must use real objects from a different realm.");
      }
      for (const input of [file, blob]) {
        const detection = await window.__heicraftDetectHeic(input);
        if (!detection.isHeic || detection.extension !== "heic") {
          throw new Error("Failed to detect a cross-realm File/Blob.");
        }
        const info = await window.__heicraftGetHeicInfo(input);
        if (info.width !== 32 || info.height !== 32) {
          throw new Error("Failed to inspect cross-realm metadata.");
        }
        const output = await window.__heicraftConvertHeic(input, {
          format: "png",
          signal: new AbortController().signal,
        });
        if (!(output.data instanceof Blob) || output.data.type !== "image/png") {
          throw new Error("Failed to convert a cross-realm File/Blob.");
        }
      }
    } finally {
      frame.remove();
    }
  }, Array.from(fixture));
  console.log(
    `Cross-realm File/Blob detection, metadata, and conversion passed in ${browserName}.`,
  );
}

async function checkBrowserEncodingPaths(page) {
  const paths = await page.evaluate(async (bytes) => {
    const input = new Uint8Array(bytes);
    const createElement = document.createElement;
    const Offscreen = window.OffscreenCanvas;
    let canvases = 0;
    document.createElement = function (name, ...args) {
      if (name === "canvas") {
        canvases++;
        if (window.OffscreenCanvas) throw new Error("Main-thread canvas must not be used.");
      }
      return createElement.call(this, name, ...args);
    };
    try {
      const offscreen = await window.__heicraftConvertHeic(input, { format: "png" });
      if (!(offscreen.data instanceof Blob)) throw new Error("Expected offscreen Blob output.");
      const offscreenCanvases = canvases;
      window.OffscreenCanvas = undefined;
      const fallback = await window.__heicraftConvertHeic(input, { format: "png" });
      if (!(fallback.data instanceof Blob)) throw new Error("Expected fallback Blob output.");
      return { offscreenCanvases, fallbackCanvases: canvases - offscreenCanvases };
    } finally {
      document.createElement = createElement;
      window.OffscreenCanvas = Offscreen;
    }
  }, Array.from(fixture));
  assert.deepEqual(paths, { offscreenCanvases: 0, fallbackCanvases: 1 });
  console.log("Offscreen worker encoding and DOM canvas fallback passed.");
}

async function checkOrientedAlpha(page) {
  const input = await readFile(new URL("../tests/fixtures/oriented-alpha.heic", import.meta.url));
  const result = await page.evaluate(async (bytes) => {
    const result = await window.__heicraftConvertHeic(new Uint8Array(bytes), { format: "png" });
    return Array.from(new Uint8Array(await result.data.arrayBuffer()));
  }, Array.from(input));
  const { data, info } = await sharp(Buffer.from(result))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 24);
  assert.equal(info.height, 40);
  for (const [x, y, alpha] of [
    [17, 10, 255],
    [17, 30, 96],
  ]) {
    assert.ok(Math.abs(data[(y * info.width + x) * 4 + 3] - alpha) <= 1);
  }
  console.log(`Non-square HEIC rotation and transparency passed in ${browserName}.`);
}

async function checkWorkerCancellation(page) {
  const stats = await page.evaluate(async (bytes) => {
    const input = new Uint8Array(bytes);
    const controller = new AbortController();
    // Abort only once input reading has finished and the decoder job was posted.
    window.__abortOnPost = () => controller.abort();
    try {
      await window.__heicraftConvertHeic(input, { signal: controller.signal });
      throw new Error("Expected cancellation of the active decoder worker.");
    } catch (error) {
      if (error.code !== "ABORT_ERROR") throw error;
    } finally {
      window.__abortOnPost = undefined;
    }
    if (input.byteLength !== bytes.length || input.some((byte, index) => byte !== bytes[index])) {
      throw new Error("Worker transfer detached or modified the caller's input.");
    }
    const recovered = await window.__heicraftConvertHeic(input);
    if (!(recovered.data instanceof Blob) || recovered.data.size === 0) {
      throw new Error("Browser conversion did not recover after worker cancellation.");
    }
    return window.__workerStats;
  }, Array.from(fixture));
  assert.deepEqual(stats, { created: 2, posted: 5, terminated: 1 });
  console.log("Real browser worker cancellation and recovery passed.");
}

async function checkConversions(page) {
  for (const format of ["jpeg", "png", "webp"]) {
    // Read Node/Sharp output with Chromium's native decoder, not Sharp again.
    const nodeResult = await convertHeic(fixture, { format, quality: 0.9 });
    assert.equal(nodeResult.format, format);
    assert.equal(nodeResult.mimeType, `image/${format}`);
    assert.ok(nodeResult.data instanceof Uint8Array);
    assertSignature(nodeResult.data, format);
    const nodePixels = await page.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Could not create a canvas context to read Node output.");
        }
        context.drawImage(bitmap, 0, 0);
        return {
          width: bitmap.width,
          height: bitmap.height,
          data: Array.from(context.getImageData(0, 0, bitmap.width, bitmap.height).data),
        };
      } finally {
        bitmap.close();
      }
    }, Array.from(nodeResult.data));
    assertPattern(nodePixels, `Node ${format}, decoded by ${browserName}`);

    const supported = await supportsBrowserOutput(page, format);
    // Exercise the bundled WASM decoder and real canvas encoder using Blob input.
    const browserResult = await page.evaluate(
      async ({ bytes, format }) => {
        const input = new Blob([new Uint8Array(bytes)], { type: "image/heic" });
        let result;
        try {
          result = await window.__heicraftConvertHeic(input, { format, quality: 0.9 });
        } catch (error) {
          return { error: { code: error.code, message: error.message } };
        }
        if (!(result.data instanceof Blob)) {
          throw new Error("Expected browser conversion to return a Blob.");
        }
        return {
          format: result.format,
          mimeType: result.mimeType,
          blobType: result.data.type,
          data: Array.from(new Uint8Array(await result.data.arrayBuffer())),
        };
      },
      { bytes: Array.from(fixture), format },
    );
    if (!supported) {
      assert.equal(format, "webp", "JPEG and PNG output must be available.");
      assert.equal(browserResult.error?.code, "UNSUPPORTED_FORMAT");
      console.log(`${browserName} correctly rejects unsupported ${format} encoding.`);
      continue;
    }
    assert.equal(browserResult.error, undefined, browserResult.error?.message);
    assert.equal(browserResult.format, format);
    assert.equal(browserResult.mimeType, `image/${format}`);
    assert.equal(browserResult.blobType, `image/${format}`);
    const bytes = Buffer.from(browserResult.data);
    assertSignature(bytes, format);

    // Read browser/canvas output with Sharp, independently of the browser encoder.
    const image = sharp(bytes);
    const metadata = await image.metadata();
    assert.equal(metadata.format, format);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assertPattern(
      { width: info.width, height: info.height, data },
      `Browser ${format}, decoded by Sharp`,
    );
    console.log(`Real ${format} conversion passed in Node.js and ${browserName}.`);
  }
}

async function supportsBrowserOutput(page, format) {
  return page.evaluate(async (format) => {
    const mime = `image/${format}`;
    if (
      typeof OffscreenCanvas !== "undefined" &&
      typeof OffscreenCanvas.prototype.convertToBlob === "function"
    ) {
      const canvas = new OffscreenCanvas(1, 1);
      canvas.getContext("2d").fillRect(0, 0, 1, 1);
      const blob = await canvas.convertToBlob({ type: mime });
      return blob.type === mime;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    canvas.getContext("2d").fillRect(0, 0, 1, 1);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime));
    return blob?.type === mime;
  }, format);
}

function assertSignature(bytes, format) {
  assert.ok(bytes.byteLength > 12, `${format} output must not be empty or truncated.`);
  const buffer = Buffer.from(bytes);
  if (format === "jpeg") {
    assert.deepEqual(buffer.subarray(0, 3), Buffer.from([0xff, 0xd8, 0xff]));
  } else if (format === "png") {
    assert.deepEqual(buffer.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  } else {
    assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
    assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  }
}

function assertPattern({ width, height, data }, label) {
  assert.equal(width, 32, `${label}: width`);
  assert.equal(height, 32, `${label}: height`);
  assert.equal(data.length, 32 * 32 * 4, `${label}: RGBA pixel count`);
  // Sample inside each quadrant, away from lossy compression at color boundaries.
  for (const y of [8, 24]) {
    for (const x of [8, 24]) {
      const offset = (y * width + x) * 4;
      const expected = [x < 16 ? 220 : 40, y < 16 ? 180 : 60, 100];
      for (let channel = 0; channel < 3; channel++) {
        assert.ok(
          Math.abs(data[offset + channel] - expected[channel]) <= 12,
          `${label}: pixel (${x}, ${y}), channel ${channel}: expected ${expected[channel]} ±12, got ${data[offset + channel]}`,
        );
      }
      assert.equal(data[offset + 3], 255, `${label}: pixel (${x}, ${y}) alpha`);
    }
  }
}

async function collectJavaScriptFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJavaScriptFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(path);
    }
  }

  return files;
}
