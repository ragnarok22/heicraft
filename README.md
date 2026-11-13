# heicraft

[![CI](https://github.com/ragnarok22/heicraft/actions/workflows/ci.yml/badge.svg)](https://github.com/ragnarok22/heicraft/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/heicraft.svg)](https://www.npmjs.com/package/heicraft)
[![license](https://img.shields.io/npm/l/heicraft.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)
[![coverage](https://img.shields.io/badge/coverage-v8-4c1.svg)](https://vitest.dev/guide/coverage)
[![bundle size](https://img.shields.io/bundlephobia/minzip/heicraft.svg)](https://bundlephobia.com/package/heicraft)
[![Node.js](https://img.shields.io/node/v/heicraft.svg)](./package.json)

Modern HEIC/HEIF conversion toolkit for JavaScript and TypeScript.

`heicraft` converts a single HEIC/HEIF image to JPEG, PNG, or WebP in browser and Node.js environments. It provides a small TypeScript-first API, basic HEIC detection, basic metadata inspection, and custom typed errors.

## Installation

```sh
npm install heicraft
```

## Browser Usage

```ts
import { convertHeic } from "heicraft";

const input = document.querySelector<HTMLInputElement>("input[type=file]");
const preview = document.querySelector<HTMLImageElement>("img");

input?.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file || !preview) {
    return;
  }

  const result = await convertHeic(file, {
    format: "jpeg",
    quality: 0.9,
  });

  const url = URL.createObjectURL(result.data);
  preview.src = url;
});
```

Browser conversion uses HEIC decoding plus a DOM canvas for output encoding. WebP output depends on the browser's canvas WebP support.

## Node.js Usage

```ts
import { readFile, writeFile } from "node:fs/promises";
import { convertHeic } from "heicraft";

const input = await readFile("./photo.heic");

const result = await convertHeic(input, {
  format: "webp",
  quality: 0.85,
});

if (!(result.data instanceof Uint8Array)) {
  throw new Error("Expected Uint8Array output in Node.js.");
}

await writeFile("./photo.webp", result.data);
```

You can also pass a Node.js file path directly:

```ts
import { convertHeic } from "heicraft";

const result = await convertHeic("./photo.heic", {
  format: "png",
});
```

String file paths are only supported in Node.js.

## API Reference

### `convertHeic(input, options?)`

Convert one HEIC/HEIF image to JPEG, PNG, or WebP.

```ts
type InputOptions = {
  maxInputBytes?: number;
};

type DecodeOptions = InputOptions & {
  maxPixels?: number;
};

type ConvertOptions = DecodeOptions & {
  format?: "jpeg" | "png" | "webp";
  quality?: number;
  filename?: string;
  signal?: AbortSignal;
};

type ConvertResult = {
  data: Blob | Uint8Array;
  format: "jpeg" | "png" | "webp";
  mimeType: string;
  filename?: string;
};
```

Defaults:

- `format`: `jpeg`
- `quality`: `0.92`
- `maxInputBytes`: `20 * 1024 * 1024` (20 MiB)
- `maxPixels`: `25_000_000` (25 megapixels)

Behavior:

- Returns a `Blob` in browser environments when possible.
- Returns `Uint8Array` data in Node.js.
- Validates `quality` as a number between `0` and `1`.
- Enforces input size before reading a Blob or file and pixel count before allocating RGBA.
- Supports `AbortSignal` before conversion and after major async steps.
- Throws typed custom errors for invalid input, unsupported output, aborts, and conversion failures.

### `isHeic(input, options?)`

Return `true` only when the binary signature identifies HEVC-based HEIC/HEIF.

```ts
const ok = await isHeic(file);
```

Detection inspects the ISO BMFF `ftyp` box and requires a HEVC-specific brand such as `heic`, `heix`, `hevc`, `hevx`, `heim`, or `heis`. Generic HEIF container brands (`mif1`, `msf1`) alone do not identify the codec and return `false`. AV1 brands (`avif`, `avis`) return `false`, even alongside generic HEIF or HEVC brands.

Filename extensions and MIME types are hints only: empty files or JPEGs renamed to `.heic` return `false`. Conversion and metadata inspection use the same signature requirement. Detection does not decode the image or guarantee successful conversion; corrupt payloads and unsupported codec profiles may still fail in the decoder.

Accepts `InputOptions` to configure `maxInputBytes`. Like other input failures, exceeding the byte limit returns `false`; use `detectHeic` if you need the error.

### `detectHeic(input, options?)`

Return detailed HEIC/HEIF detection information.

Accepts `InputOptions` to configure `maxInputBytes` and throws `ResourceLimitError` if exceeded. Detection does not decode pixels, so `maxPixels` does not apply.

Blob/File inputs use bounded slices and Node.js paths use partial reads: only the header and compatible brands of `ftyp` are read, not the image payload. All compatible brands are checked, including those beyond the first chunk. An `ftyp` with size zero extends to EOF and therefore requires scanning the remaining input, still in bounded chunks. In-memory buffers use views without copying their contents. The byte limit applies to the entire input, not just the bytes inspected.

```ts
type HeicDetectionResult = {
  isHeic: boolean;
  isHeif: boolean;
  codec?: "hevc" | "av1";
  brand?: string;
  mimeType?: "image/heic" | "image/heif";
  extension?: "heic" | "heif";
};
```

`isHeif` identifies the container independently of the codec, including AVIF. `codec` and `brand` come from the binary signature, with AV1 taking precedence over HEVC and HEVC over generic HEIF brands. `mimeType` is signature-derived and is undefined for AVIF or unrecognized data. `extension` is only a filename/MIME hint and may be present even when `isHeic` and `isHeif` are both `false`.

Example:

```ts
import { detectHeic } from "heicraft";

const result = await detectHeic(file);

if (result.isHeic) {
  console.log(result.brand, result.mimeType);
}
```

### `getHeicInfo(input, options?)`

Return basic image information when it can be determined reliably.

```ts
type HeicInfo = {
  width?: number;
  height?: number;
  mimeType?: "image/heic" | "image/heif";
  brand?: string;
  imagesCount?: number;
  hasAlpha?: boolean;
};
```

Width, height, and the count of top-level images are read from libheif's image handles without decoding pixels or allocating RGBA. The current backend still requires the complete compressed input in memory; this is not a streaming metadata reader. Signature-derived information remains available if backend parsing fails.

Accepts the exported `InfoOptions` type, extending `DecodeOptions` with optional transparency inspection:

```ts
type InfoOptions = DecodeOptions & {
  inspectAlpha?: boolean; // defaults to false
};

const info = await getHeicInfo(file); // dimensions and image count, no RGBA
const withAlpha = await getHeicInfo(file, { inspectAlpha: true });
```

**`hasAlpha` is omitted by default.** Set `inspectAlpha: true` to check for non-opaque pixels. An alpha channel can be entirely opaque, so channel presence alone is not reported as transparency. If the backend confirms there is no alpha channel, `hasAlpha` is `false` without rendering; otherwise opt-in inspection decodes RGBA and scans the alpha values.

The same byte and pixel limits as conversion apply, even without rendering. Resource-limit errors are propagated, not replaced with partial metadata.

## Resource Limits

All entry points default to a maximum input size of **20 MiB**. Conversion and metadata inspection also default to **25 million pixels** for the image being inspected. A 48-megapixel image is rejected by default, including metadata-only queries, before any RGBA allocation.

Both limits accept positive safe integers only; `0`, negative or fractional values, `NaN`, and `Infinity` are invalid. An input or pixel count exactly equal to the configured limit is allowed. Override the limits per call when larger images are expected:

```ts
const result = await convertHeic("./photo.heic", {
  maxInputBytes: 50 * 1024 * 1024,
  maxPixels: 50_000_000,
});
```

Blob/File sizes are checked before reading any bytes. Node.js paths are checked on the opened file; full reads are byte-capped even if the file grows, and partial detection rechecks the file size before returning. For buffers already in memory, the limit applies to the supplied view's byte length; it cannot undo allocations made by the caller. Pass a file path directly instead of calling `readFile()` yourself when you need the library to bound file reading.

Dimensions are checked on libheif's image handle before allocating RGBA or rendering pixels. These limits are **not a total memory or CPU budget**: parsing, native decoding, encoding, and concurrent calls can use additional resources. Isolate untrusted workloads and limit concurrency where appropriate.

## Supported Input Types

- `File`
- `Blob`
- `ArrayBuffer`
- `Uint8Array`
- Node.js `Buffer`
- Node.js string file path

## Supported Output Formats

- `jpeg`
- `png`
- `webp`

## Error Handling

```ts
import { convertHeic, HeicraftError, InvalidInputError, UnsupportedFormatError } from "heicraft";

try {
  const result = await convertHeic(file, { format: "webp" });
  console.log(result);
} catch (error) {
  if (error instanceof InvalidInputError) {
    console.error("Not a valid HEIC/HEIF file.");
  } else if (error instanceof UnsupportedFormatError) {
    console.error("The requested output format is not supported here.");
  } else if (error instanceof HeicraftError) {
    console.error(error.code, error.message);
  } else {
    throw error;
  }
}
```

Custom errors:

- `HeicraftError`
- `InvalidInputError`
- `ResourceLimitError` (`RESOURCE_LIMIT_EXCEEDED`)
- `UnsupportedFormatError`
- `ConversionError`
- `AbortError`

## Known Limitations

- Converts one image at a time.
- No CLI yet.
- No batch conversion yet.
- No Web Worker integration yet.
- No React hooks yet.
- No advanced resizing, cropping, or EXIF editing yet.
- No streaming API yet.
- Multi-image HEIC extraction is not part of this MVP.
- Browser conversion requires a DOM canvas environment.
- Browser WebP output depends on browser canvas support.
- Native decoding still requires a libheif-supported container and codec profile. In particular, `heim`/`heis` alone are not accepted without a supported compatible brand such as `mif1`.

## Third-Party Backend

HEIC decoding uses [`libheif-js`](https://www.npmjs.com/package/libheif-js) directly through its bundled WebAssembly build. The adapter passes the original bytes to libheif, including compatible-brand and extended-size `ftyp` headers, and returns raw RGBA pixel data.

Node.js output encoding uses [`sharp`](https://www.npmjs.com/package/sharp). Browser output encoding uses the platform canvas API.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for dependency licensing notes.

## Licensing Notes

- `heicraft` wrapper/source code is MIT licensed.
- HEIC decoding uses third-party dependencies with their own licenses.
- The decoder backend is `libheif-js`, an Emscripten distribution of `libheif`.
- `libheif-js` is LGPL-3.0 licensed.
- Third-party license notices are not hidden, renamed, bundled away, or obscured by this package.
- Users should review dependency licenses before using this package in commercial or closed-source products.
- This section is informational and is not legal advice.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for more detail.

## Project Documents

- [Changelog](./CHANGELOG.md)
- [Contributing](./CONTRIBUTING.md)
- [Security Policy](./SECURITY.md)
- [Third-Party Notices](./THIRD_PARTY_NOTICES.md)

## License

MIT for the `heicraft` wrapper/library code. See [LICENSE](./LICENSE).
