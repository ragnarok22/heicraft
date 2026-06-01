# heicraft

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
type ConvertOptions = {
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

Behavior:

- Returns a `Blob` in browser environments when possible.
- Returns `Uint8Array` data in Node.js.
- Validates `quality` as a number between `0` and `1`.
- Supports `AbortSignal` before conversion and after major async steps.
- Throws typed custom errors for invalid input, unsupported output, aborts, and conversion failures.

### `isHeic(input)`

Return `true` or `false` if the input appears to be HEIC/HEIF.

```ts
const ok = await isHeic(file);
```

Detection inspects the ISO BMFF `ftyp` box when possible and recognizes brands such as `heic`, `heix`, `hevc`, `hevx`, `heim`, `heis`, `mif1`, and `msf1`.

### `detectHeic(input)`

Return detailed HEIC/HEIF detection information.

```ts
type HeicDetectionResult = {
  isHeic: boolean;
  brand?: string;
  mimeType?: "image/heic" | "image/heif";
  extension?: "heic" | "heif";
};
```

Example:

```ts
import { detectHeic } from "heicraft";

const result = await detectHeic(file);

if (result.isHeic) {
  console.log(result.brand, result.mimeType);
}
```

### `getHeicInfo(input)`

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

For the MVP, metadata is intentionally basic. Width, height, and alpha information require the decoder to successfully decode the primary image.

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
import {
  convertHeic,
  HeicraftError,
  InvalidInputError,
  UnsupportedFormatError,
} from "heicraft";

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
- Successful conversion tests require adding a real HEIC fixture at `tests/fixtures/photo.heic`.

## Third-Party Backend

The initial HEIC decoder backend is [`heic-decode`](https://www.npmjs.com/package/heic-decode). It decodes HEIC images to raw RGBA pixel data.

Node.js output encoding uses [`sharp`](https://www.npmjs.com/package/sharp). Browser output encoding uses the platform canvas API.

## Licensing Notes

- `heicraft` wrapper/source code is MIT licensed.
- HEIC decoding uses third-party dependencies with their own licenses.
- The initial decoder backend is `heic-decode`.
- `heic-decode` depends on `libheif-js` / `libheif` technology.
- `libheif-js` is LGPL-3.0 licensed.
- Third-party license notices are not hidden, renamed, bundled away, or obscured by this package.
- Users should review dependency licenses before using this package in commercial or closed-source products.
- This section is informational and is not legal advice.

## License

MIT for the `heicraft` wrapper/library code. See [LICENSE](./LICENSE).
