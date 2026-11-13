# heicraft

[![CI](https://github.com/ragnarok22/heicraft/actions/workflows/ci.yml/badge.svg)](https://github.com/ragnarok22/heicraft/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/heicraft.svg)](https://www.npmjs.com/package/heicraft)
[![Node.js](https://img.shields.io/node/v/heicraft.svg)](./package.json)
[![license](https://img.shields.io/npm/l/heicraft.svg)](./LICENSE)

Convert HEIC/HEIF images to JPEG, PNG, or WebP in Node.js and browsers.

`heicraft` provides a TypeScript-first API for single-image conversion, signature-based detection, and basic metadata inspection. Decoding runs in workers, with per-call resource limits, cancellation, and typed errors.

- [Installation](#installation)
- [Node.js Usage](#nodejs-usage)
- [Browser Usage](#browser-usage)
- [Supported Inputs and Outputs](#supported-inputs-and-outputs)
- [API Reference](#api-reference)
- [Workers and Cancellation](#workers-and-cancellation)
- [Resource Limits](#resource-limits)
- [Error Handling](#error-handling)
- [Known Limitations](#known-limitations)
- [Project Documents](#project-documents)

## Installation

```sh
npm install heicraft
```

The package is **ESM-only** and includes TypeScript declarations.

| Environment | Requirements                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js     | Maintained LTS lines **22** (22.13.0 or later), **24**, and **26**. Use the latest patch release of a supported line. Output encoding uses `sharp`; its native dependencies must support your deployment platform. |
| Browser     | WebAssembly and module Web Workers. Encoding uses OffscreenCanvas where available, otherwise a DOM canvas. Use a bundler that honors browser mappings and emits the worker asset.                                  |

The production Vite build is smoke-tested in Chromium. This is not a guarantee of compatibility with every browser or bundler. See [browser deployment requirements](#browser-deployment).

### Upgrading to 0.3.0

Version 0.2.0 was intentionally skipped. Detection now requires a binary HEVC
signature, default resource limits are 20 MiB and 25 million pixels, and `hasAlpha`
requires `inspectAlpha: true`. Browser deployments must include the worker asset.
See the [0.3.0 migration notes](./CHANGELOG.md#030) for details.

## Node.js Usage

Pass a local file path and write the returned bytes:

```ts
import { writeFile } from "node:fs/promises";
import { convertHeic } from "heicraft";

const result = await convertHeic("./photo.heic", {
  format: "webp",
  quality: 0.85,
});

if (!(result.data instanceof Uint8Array)) {
  throw new Error("Expected Uint8Array output in Node.js.");
}

await writeFile("./photo.webp", result.data);
```

`Buffer` and other supported binary inputs also work. Prefer passing a path instead of calling `readFile()` yourself when you want the library to enforce its byte limit while reading. A string is a filesystem path, not a URL, and is supported only in Node.js.

## Browser Usage

Given a file input and a preview element:

```html
<input id="photo" type="file" accept=".heic,.heif,image/heic,image/heif" />
<img id="preview" alt="Converted image preview" />
```

Handle conversion in your application's TypeScript:

```ts
import { convertHeic } from "heicraft";

const input = document.querySelector<HTMLInputElement>("#photo");
const preview = document.querySelector<HTMLImageElement>("#preview");

if (!input || !preview) {
  throw new Error("Missing file input or preview element.");
}

let previewUrl: string | undefined;

input.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  input.disabled = true;
  try {
    const result = await convertHeic(file, {
      format: "jpeg",
      quality: 0.9,
    });

    if (!(result.data instanceof Blob)) {
      throw new Error("Expected Blob output in the browser.");
    }

    const previousUrl = previewUrl;
    previewUrl = URL.createObjectURL(result.data);
    preview.src = previewUrl;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
  } catch (error) {
    console.error("Could not convert the image.", error);
  } finally {
    input.disabled = false;
  }
});
```

Keep the current object URL while the preview is in use. When removing the preview or unmounting its component, also call `URL.revokeObjectURL(previewUrl)` if it is set.

The input's `accept` attribute is only a file-picker hint, not validation. `convertHeic` checks the binary signature itself.

### Browser Deployment

- Serve the worker asset emitted by your bundler along with the application.
- Allow the worker and WebAssembly execution under your Content Security Policy. Required directives depend on your bundler and deployment; do not disable CSP to make conversion work.
- Browser output encoding runs inside the decoder worker using OffscreenCanvas when supported, with a DOM canvas fallback. Unsupported output is reported rather than silently returned as PNG.
- Worker startup failures are reported. There is no fallback to decoding on the main thread.

## Supported Inputs and Outputs

All four public functions accept the exported `HeicInput` type:

| Input                                       | Browser | Node.js |
| ------------------------------------------- | ------- | ------- |
| `File`, `Blob`, `ArrayBuffer`, `Uint8Array` | Yes     | Yes     |
| `Buffer`                                    | —       | Yes     |
| String file path                            | —       | Yes     |

Conversion returns a `Blob` in the browser and a `Uint8Array` in Node.js. The public result type is a union, so TypeScript callers should narrow it as shown above.

| `format`         | Output MIME type |
| ---------------- | ---------------- |
| `jpeg` (default) | `image/jpeg`     |
| `png`            | `image/png`      |
| `webp`           | `image/webp`     |

Inputs must identify HEVC-based HEIC/HEIF. Generic HEIF containers without a HEVC brand and AVIF inputs are not accepted for conversion.

## API Reference

| Function                       | Returns                        | Purpose                                                             |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------- |
| `convertHeic(input, options?)` | `Promise<ConvertResult>`       | Convert the first top-level image returned by the decoder.          |
| `isHeic(input, options?)`      | `Promise<boolean>`             | Check for a HEVC-based HEIC/HEIF signature.                         |
| `detectHeic(input, options?)`  | `Promise<HeicDetectionResult>` | Inspect the container and codec brands.                             |
| `getHeicInfo(input, options?)` | `Promise<HeicInfo>`            | Inspect basic image information, optionally including transparency. |

### Shared Options

| Option          | Default                     | Applies to              | Behavior                                                                        |
| --------------- | --------------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `maxInputBytes` | `20 * 1024 * 1024` (20 MiB) | All functions           | Maximum size of the entire input, not just the bytes inspected.                 |
| `signal`        | None                        | All functions           | An `AbortSignal` for cancellation.                                              |
| `maxPixels`     | `25_000_000`                | Conversion and metadata | Maximum pixel count of the image being inspected, even for metadata-only calls. |

`InputOptions` contains `maxInputBytes` and `signal`. `DecodeOptions` extends it with `maxPixels`; `ConvertOptions` and `InfoOptions` extend `DecodeOptions`. All of these types are exported.

### `convertHeic(input, options?)`

Accepts the shared decoding options plus:

| Option     | Default  | Behavior                                                                                                           |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `format`   | `"jpeg"` | One of `"jpeg"`, `"png"`, or `"webp"`.                                                                             |
| `quality`  | `0.92`   | Number from `0` to `1`, inclusive. Controls JPEG/WebP encoding; PNG ignores it, but the value is still validated.  |
| `filename` | None     | Optional label copied to `result.filename`. Not inferred from the input; does not create, rename, or write a file. |

```ts
type ConvertResult = {
  data: Blob | Uint8Array;
  format: "jpeg" | "png" | "webp";
  mimeType: string;
  filename?: string;
};
```

Node.js maps quality to Sharp's integer range of `1`–`100`; browsers pass it to the canvas encoder. Matching settings do not guarantee identical output across environments.

### `isHeic(input, options?)`

Accepts `InputOptions` and returns `true` only for a HEVC-specific binary signature. For this and the following API examples, `file` is a `File` selected by your application.

```ts
import { isHeic } from "heicraft";

const ok = await isHeic(file);
```

Invalid or unreadable inputs and byte-limit failures return `false`. Cancellation rejects with heicraft's `AbortError`, never `false`. Use `detectHeic` when you need input errors rather than a boolean.

Detection is not a full validity check: a matching signature does not guarantee that the payload can be decoded.

### `detectHeic(input, options?)`

Accepts `InputOptions` and inspects the leading ISO BMFF `ftyp` box without decoding pixels. Unlike `isHeic`, input failures are propagated, including `ResourceLimitError` for oversized inputs. `maxPixels` does not apply.

```ts
import { detectHeic } from "heicraft";

const detection = await detectHeic(file);
console.log(detection.isHeic, detection.codec, detection.brand);
```

| Result field | Meaning                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------ |
| `isHeic`     | Whether the signature identifies HEVC-based HEIC/HEIF.                                     |
| `isHeif`     | Whether a recognized HEIF container brand is present, including AVIF.                      |
| `codec?`     | `"hevc"` or `"av1"`, when identified by the signature.                                     |
| `brand?`     | Selected recognized major or compatible brand.                                             |
| `mimeType?`  | Signature-derived `"image/heic"` or `"image/heif"`; omitted for AVIF or unrecognized data. |
| `extension?` | Filename/MIME hint, `"heic"` or `"heif"`. May be present even for unrecognized bytes.      |

Brand handling is deliberately conservative:

- HEVC brands: `heic`, `heix`, `hevc`, `hevx`, `heim`, `heis`.
- Generic HEIF brands: `mif1`, `msf1`. These alone do not identify the codec and produce `isHeic: false`.
- AV1 brands: `avif`, `avis`. AV1 takes precedence over HEVC, which takes precedence over generic HEIF.
- Filename extensions and MIME hints do not change the detected container or codec. Renaming a JPEG to `.heic` does not make it HEIC.

Blob/File inputs use bounded slices; Node.js paths use partial reads. Compatible brands are checked beyond the first chunk unless AV1 already determines the result. A size-zero `ftyp` extends to EOF; scans use bounded chunks and periodically yield to allow cancellation and other events. In-memory inputs are inspected through views without copying their contents.

### `getHeicInfo(input, options?)`

Accepts `InfoOptions`: the shared decoding options plus `inspectAlpha?: boolean` (default `false`).

```ts
import { getHeicInfo } from "heicraft";

const info = await getHeicInfo(file);
const withAlpha = await getHeicInfo(file, { inspectAlpha: true });
```

| Result field          | Meaning                                                                           |
| --------------------- | --------------------------------------------------------------------------------- |
| `width?`, `height?`   | Dimensions of the first top-level image returned by the decoder.                  |
| `imagesCount?`        | Number of top-level images reported by libheif.                                   |
| `mimeType?`, `brand?` | Information derived from the binary signature.                                    |
| `hasAlpha?`           | Whether any pixel is non-opaque; omitted unless transparency inspection succeeds. |

Dimensions and image count are read from image handles without rendering pixels or allocating RGBA. The complete compressed input is still held in memory; this is not a streaming metadata reader.

**`hasAlpha` is omitted by default.** With `inspectAlpha: true`, an image without an alpha channel returns `false` without rendering. Otherwise, the image is decoded and its alpha values scanned: an entirely opaque alpha channel also returns `false`.

All result fields are optional. Backend parsing or rendering failures may leave only signature-derived information. Cancellation, resource-limit errors, unsupported-runtime errors, and worker startup/transport failures are propagated, not replaced with partial metadata. The byte and pixel limits apply even without rendering.

## Workers and Cancellation

Conversion decoding, metadata parsing, optional transparency inspection, and supported browser output encoding run in reusable workers:

| Internal limit, per loaded library instance             | Browser      | Node.js                                  |
| ------------------------------------------------------- | ------------ | ---------------------------------------- |
| Decoder workers                                         | 1 Web Worker | Up to 2 `worker_threads`, created lazily |
| Queued decoder jobs                                     | 8            | 8                                        |
| Conversion/metadata calls admitted before input reading | 9            | 10                                       |

Each worker handles one job at a time. Saturation throws `ResourceLimitError`. Admission is held until the entire operation, including output encoding, completes or fails. These are fixed implementation limits, not a configurable pool API or a process-wide budget. Detection does not use the decoder pool.

All four entry points accept an `AbortSignal`:

```ts
import { AbortError, convertHeic } from "heicraft";

const controller = new AbortController();
const conversion = convertHeic(file, { signal: controller.signal });
controller.abort();

try {
  await conversion;
} catch (error) {
  if (!(error instanceof AbortError)) {
    throw error;
  }
}
```

Cancelling removes a queued job or terminates the worker running it, without cancelling other calls. This also interrupts browser encoding when it runs in that worker. Replacement workers are created as needed; Node.js waits for termination before reusing capacity. Workers terminate after 30 seconds of inactivity to release their WASM memory. Idle Node.js workers and their cleanup timers do not keep the process alive.

With a signal, full Node.js file reads use abortable, byte-capped streams and Blob/File reads cancel their stream reader. Partial file detection checks cancellation around each bounded read. An operating-system read already in progress may still finish; no further chunks are requested after cancellation.

Cancellation **does not interrupt an already-running Sharp or fallback DOM `canvas.toBlob()` encoder**. Conversion checks the signal after encoding instead, retaining its admission slot until that encoder finishes.

Caller-owned buffers are never transferred or detached. The library transfers an internal input copy and returns worker-owned RGBA using transferables.

## Resource Limits

The defaults are **20 MiB of input** and **25 million pixels** for conversion or metadata inspection. A 48-megapixel image is rejected by default, including for metadata-only queries.

Both limits require positive safe integers. `0`, negatives, fractions, `NaN`, and `Infinity` are invalid. A size or pixel count exactly equal to the configured limit is allowed.

Override limits per call when you expect larger images:

```ts
import { convertHeic } from "heicraft";

const result = await convertHeic("./photo.heic", {
  maxInputBytes: 50 * 1024 * 1024,
  maxPixels: 50_000_000,
});
```

- Blob/File sizes are checked before reading any bytes.
- Node.js paths are checked on the opened file and non-regular files are rejected. Nonblocking opening avoids waiting for a FIFO writer on supported platforms. Full reads remain byte-capped if the file grows; partial detection rechecks file size before returning.
- For in-memory inputs, the limit applies to the supplied view's byte length and cannot undo allocations already made by the caller.
- Dimensions are checked on libheif's image handle before allocating RGBA or rendering pixels.

These are **not total memory or execution-time limits**. Parsing, decoding, encoding, and concurrent calls use additional resources. For handling untrusted uploads and enforcing application-level isolation, see the [Security Policy](https://github.com/ragnarok22/heicraft/blob/main/SECURITY.md#handling-untrusted-images).

## Error Handling

```ts
import { convertHeic, HeicraftError, ResourceLimitError } from "heicraft";

try {
  const result = await convertHeic(file, { format: "webp" });
  console.log(result.mimeType);
} catch (error) {
  if (error instanceof ResourceLimitError) {
    console.error("Input is too large, has too many pixels, or the decoder queue is full.");
  } else if (error instanceof HeicraftError) {
    console.error(error.code, error.message);
  } else {
    throw error;
  }
}
```

All library error classes extend `HeicraftError`, which provides `message` and `code`:

| Class                    | `code`                    | Typical cause                                              |
| ------------------------ | ------------------------- | ---------------------------------------------------------- |
| `InvalidInputError`      | `INVALID_INPUT`           | Missing, unreadable, or non-HEIC input; invalid options.   |
| `ResourceLimitError`     | `RESOURCE_LIMIT_EXCEEDED` | Byte/pixel limit exceeded or decoder admission/queue full. |
| `UnsupportedFormatError` | `UNSUPPORTED_FORMAT`      | Unsupported output or missing required runtime capability. |
| `ConversionError`        | `CONVERSION_ERROR`        | Decoder, worker startup, or encoder failure.               |
| `AbortError`             | `ABORT_ERROR`             | Cancellation through `AbortSignal`.                        |

The exported `AbortError` is heicraft's error class, not a DOM `AbortError`. The boolean and partial-metadata exceptions are described under [`isHeic`](#isheicinput-options) and [`getHeicInfo`](#getheicinfoinput-options).

Wrapped errors retain the underlying failure in `cause`. Decoder errors crossing a worker boundary preserve diagnostic fields (`name`, `message`, `stack`) and up to eight cause entries.

## Known Limitations

- One image is converted per call: the first top-level image returned by libheif. There is no multi-image extraction or animation API.
- No CLI, batch API, React hooks, resize/crop helpers, streaming, or metadata editing/preservation API.
- Conversion re-encodes pixels; do not rely on source EXIF or color-profile metadata being preserved.
- AVIF and generic HEIF signatures without a HEVC brand are not accepted for conversion or metadata inspection.
- A recognized signature does not guarantee backend support. For example, `heim`/`heis` alone require a supported compatible brand such as `mif1` for the current libheif backend.
- Browser conversion needs a working decoder worker and either OffscreenCanvas encoding or a DOM canvas fallback. WebP support depends on the selected platform encoder.

## Project Documents

- [Roadmap](https://github.com/ragnarok22/heicraft/blob/main/ROADMAP.md) — current foundation and future direction.
- [Changelog](./CHANGELOG.md) — released changes.
- [Contributing](https://github.com/ragnarok22/heicraft/blob/main/CONTRIBUTING.md) — development setup and contribution guidelines.
- [Security Policy](https://github.com/ragnarok22/heicraft/blob/main/SECURITY.md) — private reporting and untrusted-input guidance.
- [Third-Party Notices](./THIRD_PARTY_NOTICES.md) — runtime dependencies, attribution, and licensing.

Repository-only documents use GitHub links so they remain accessible from the npm package README.

## License

The heicraft wrapper/library code is [MIT licensed](./LICENSE). HEIC decoding uses `libheif-js` (**LGPL-3.0**); Node.js encoding uses `sharp` (**Apache-2.0**) and its separately licensed native dependencies. Browser encoding uses the platform canvas API.

The MIT license does not replace those third-party licenses. Review [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) before redistributing the package or a bundled application.
