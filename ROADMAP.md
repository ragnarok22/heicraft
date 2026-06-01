# HEICRAFT MVP Roadmap

## Goal

Create a modern, TypeScript-first library for converting HEIC/HEIF files to common image formats in both browser and Node.js environments.

**MVP version:** `0.1.0`

## Core Objective

Allow developers to reliably convert a HEIC/HEIF file into JPEG, PNG, or WebP with a simple API.

```ts
const result = await convertHeic(file, {
  format: "jpeg",
  quality: 0.9,
});
```

## MVP Phases

### Phase 1: Project Setup

- [ ] Create the npm package: `heicraft`
- [ ] Set up TypeScript
- [ ] Set up the build system
- [ ] Use ESM as the main module format
- [ ] Generate type definitions automatically
- [ ] Add basic linting and formatting
- [ ] Add a README with installation and basic usage
- [ ] Add an MIT license for project-owned code

### Phase 2: Core API

Implement the main conversion function:

```ts
convertHeic(input, options);
```

Supported inputs:

- `File`
- `Blob`
- `ArrayBuffer`
- `Uint8Array`
- `Buffer` for Node.js

Supported output formats:

- `jpeg`
- `png`
- `webp`

Basic options:

- `format`
- `quality`
- `filename`
- `mimeType`

Return result as:

- `Blob` in the browser
- `Buffer` or `Uint8Array` in Node.js

### Phase 3: Format Detection

Add utility functions:

```ts
isHeic(input);
detectHeic(input);
```

Detection should inspect the file signature, not only the file extension.

Supported detections:

- `.heic`
- `.heif`
- `image/heic`
- `image/heif`
- HEIF file brands such as `heic`, `heix`, `hevc`, `mif1`, and `msf1`

### Phase 4: Basic Image Info

Add metadata helper:

```ts
getHeicInfo(input);
```

Return:

- `width`
- `height`
- `mimeType`
- `format`
- `imagesCount`, if possible
- `hasAlpha`, if possible

This does not need to be perfect for the MVP, but it should return useful basic information.

### Phase 5: Browser Support

Make sure conversion works with:

- `<input type="file">`
- Drag-and-drop files
- `Blob` output
- Object URLs

Example:

```ts
const result = await convertHeic(file, {
  format: "jpeg",
  quality: 0.9,
});
```

### Phase 6: Node.js Support

Make sure conversion works with:

- Local file paths
- `Buffer` input
- Writing output files

Example:

```ts
const result = await convertHeic(buffer, {
  format: "webp",
  quality: 0.85,
});
```

### Phase 7: Error Handling

Create clear custom errors:

- `InvalidInputError`
- `UnsupportedFormatError`
- `ConversionError`
- `AbortError`

Make error messages useful for developers.

Examples:

- `Input is not a valid HEIC or HEIF file.`
- `WebP output is not supported in this environment.`
- `Conversion failed while decoding HEIC image.`

### Phase 8: Basic Tests

Add tests for:

- HEIC detection
- Invalid files
- JPEG conversion
- PNG conversion
- WebP conversion
- Browser-like `Blob` input
- Node.js `Buffer` input
- `quality` option
- Missing input

### Phase 9: Documentation

The README should include:

- What `heicraft` does
- Installation
- Browser usage
- Node.js usage
- API reference
- Supported formats
- Known limitations
- License notes

Installation example:

```sh
npm install heicraft
```

### Phase 10: Publish MVP

Publish:

```text
heicraft@0.1.0
```

NPM description:

> Modern HEIC/HEIF conversion toolkit for JavaScript and TypeScript. Convert HEIC to JPEG, PNG, and WebP in browser and Node.js.

Keywords:

- `heic`
- `heif`
- `jpeg`
- `jpg`
- `png`
- `webp`
- `convert`
- `image`
- `browser`
- `node`
- `typescript`

## MVP Scope

### Included

- Single-file conversion
- JPEG output
- PNG output
- WebP output
- Browser support
- Node.js support
- TypeScript types
- Basic format detection
- Basic metadata
- Basic tests
- Basic documentation

### Not Included Yet

- CLI
- Batch conversion
- Web Workers
- React hooks
- Advanced resizing
- EXIF preservation
- Full metadata editing
- Multi-image HEIC extraction
- Streaming
- Cloud/serverless optimizations

## Next Versions

### Version 0.2.0

- Add CLI support.

### Version 0.3.0

- Add batch conversion with progress reporting and concurrency controls.

### Version 0.4.0

- Add resize, crop, and compression helpers.

### Version 0.5.0

- Add Web Worker support for browser performance.

### Version 0.6.0

- Add multi-image HEIC extraction.

### Version 1.0.0

- Stabilize the API.
- Complete the documentation.
- Reach strong test coverage.
- Prepare a production-ready release.
