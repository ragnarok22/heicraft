# Roadmap

heicraft aims to make HEIC/HEIF conversion straightforward in Node.js and browsers without hiding runtime requirements, resource costs, or third-party licensing.

This document describes direction, not a release schedule. **Now** separates the implemented foundation from current maintenance priorities. **Next** lists proposed priorities; **Later** covers longer-term possibilities. Future work is not a promise of a particular version or delivery date.

For usage and API behavior, see the [README](./README.md). For released changes, see the [Changelog](./CHANGELOG.md). The implemented baseline below describes the current source tree, which may be ahead of the latest npm release.

## Now — Maintain the Foundation

### Implemented

- Single-image conversion to JPEG, PNG, and WebP.
- Browser and Node.js inputs, including Node.js filesystem paths.
- ESM output and exported TypeScript declarations.
- Signature-based detection that distinguishes HEVC, AV1, and generic HEIF brands.
- Basic dimensions and image-count inspection without rendering, plus opt-in transparency inspection.
- Browser Web Worker decoding and a bounded Node.js worker pool.
- Cancellation during input reading, queueing, and active decoding.
- Default input-byte and pixel-count limits, bounded decoder admission, and typed errors.
- Real-image integration tests and a production Vite/Chromium smoke test.
- CI checks for formatting, linting, types, tests, and package builds.

### Maintenance Priorities

- Keep documented behavior aligned with implementation and tested examples.
- Expand real-image and container-variant coverage when practical, using redistributable fixtures.
- Maintain decoder/encoder dependencies and investigate security or compatibility regressions.
- Preserve clear worker-deployment requirements, cancellation semantics, and resource-limit boundaries.

Worker support is already implemented; it is not a future milestone. The internal pool is not a public concurrency-control API.

## Next — Make Conversion Easier to Use

These are proposed priorities, not features available in the current API.

### Command-Line Interface

- Convert local files without writing an application.
- Expose output format, quality, destination, and resource-limit options.
- Provide actionable errors and predictable exit codes.
- Reuse the library's validation and conversion behavior.

### Batch Conversion

- Convert multiple inputs with explicit concurrency controls.
- Report per-file progress and results.
- Define partial-failure and cancellation behavior.
- Avoid unbounded input reads or decoder/encoder work.

CLI and batch designs should be discussed before implementation so they do not expand or complicate the core single-image API unnecessarily.

## Later — Broaden Capabilities

### Image Transformations

- Resize and crop helpers.
- More explicit compression controls where supported by the encoder.
- Consistent, documented behavior across browser and Node.js backends.

### Multi-Image Extraction

- Select or extract top-level images from multi-image HEIC containers.
- Define image ordering, per-image metadata, output naming, and resource limits.

### API Stabilization

Before a 1.0 release:

- Review public types, defaults, errors, and cancellation behavior for long-term compatibility.
- Document and verify the supported runtime and bundler combinations.
- Cover critical conversion paths and realistic failure modes with reliable tests.
- Keep packaging and licensing documentation accurate for distributed artifacts.

### Not Currently Scheduled

React-specific hooks, streaming, EXIF preservation, full metadata editing, and cloud/serverless-specific optimizations remain exploratory. Their appearance here does not mean they are accepted for implementation.

## Proposing Work

For feature proposals, open a [GitHub issue](https://github.com/ragnarok22/heicraft/issues) describing the use case, target runtimes, expected API, and relevant compatibility or resource tradeoffs. Check [CONTRIBUTING.md](./CONTRIBUTING.md) before starting a substantial change.
