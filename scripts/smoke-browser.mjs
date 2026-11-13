import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import { build, preview } from "vite";
import { convertHeic } from "../dist/index.js";

const projectRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const fixture = await readFile(new URL("../tests/fixtures/pattern.heic", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "heicraft-browser-"));
let server;
let browser;
let conversionTimeout;

try {
  await writeFile(
    join(directory, "index.js"),
    'import { convertHeic } from "heicraft"; window.__heicraftConvertHeic = convertHeic;\n',
  );

  await writeFile(
    join(directory, "index.html"),
    '<script type="module" src="/index.js"></script>\n',
  );
  await mkdir(join(directory, "node_modules"));
  await symlink(projectRoot, join(directory, "node_modules", "heicraft"), "dir");

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

  const forbidden = ["sharp/lib", "@img/sharp", "browser-external:node:fs/promises"];
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
  browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => typeof window.__heicraftConvertHeic === "function");

  await Promise.race([
    checkConversions(page),
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
    assertPattern(nodePixels, `Node ${format}, decoded by Chromium`);

    // Exercise the bundled WASM decoder and real canvas encoder using Blob input.
    const browserResult = await page.evaluate(
      async ({ bytes, format }) => {
        const input = new Blob([new Uint8Array(bytes)], { type: "image/heic" });
        const result = await window.__heicraftConvertHeic(input, { format, quality: 0.9 });
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
    console.log(`Real ${format} conversion passed in Node.js and Chromium.`);
  }
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
