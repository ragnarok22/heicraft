# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- Lightweight `heicraft/detect` entrypoint for detection-only consumers, without
  emitting decoder workers in production Vite builds.
- Cross-realm Blob/File support, including files created in iframes.
- WebKit smoke coverage and focused native-worker/encoder checks for macOS and Windows.

### Changed

- Transfer library-owned input buffers directly to workers instead of making
  another compressed-input copy. Caller-owned buffers remain protected.

### Fixed

- Preserve decoder dependency/loading failures across worker serialization and
  propagate them from metadata inspection.
- Retain valid dimensions and image counts when optional alpha rendering fails.

## 0.3.0

Release date: 2026-11-13.

Version 0.2.0 was intentionally skipped to reflect the scope of this update.

### Added

- Reusable browser workers and a bounded Node.js worker pool, with cancellation
  during input reading, queued work, and active worker operations.
- Worker-side browser encoding using OffscreenCanvas when available, with a DOM
  canvas fallback. Idle workers release their memory after 30 seconds.
- Configurable input-byte and pixel-count limits, enforced before input loading
  and RGBA allocation where applicable, with typed `ResourceLimitError` failures.
- Dimensions and image-count inspection without decoding pixels, plus opt-in
  transparency inspection through `getHeicInfo(input, { inspectAlpha: true })`.
- Real-image integration tests for JPEG, PNG, WebP, rotation, and transparency.
- Cross-runtime smoke tests against the actual npm tarball in Node.js and Chromium,
  including worker cancellation, OffscreenCanvas, and DOM fallback paths.

### Changed

- Use libheif-js directly, supporting compatible brands and extended-size HEIF
  headers without modifying input bytes.
- Keep complete conversions admitted until output encoding finishes, bounding
  concurrent encoders as well as pending decoder work.
- Inspect only the required input ranges for detection, scan brands without
  per-brand allocations, and yield during large scans to preserve responsiveness.
- Avoid redundant copies of decoded pixel buffers and preserve typed-array ranges.
- Preserve error causes and decoder diagnostics across worker boundaries.
- Support maintained Node.js LTS lines 22 (22.13.0+), 24, and 26.
- Identify the documented release version, retain older-version guidance, and document
  contributor prerequisites and local browser-example build/preview commands.

### Fixed

- Reject empty files, renamed JPEGs, and AVIF inputs instead of trusting extensions
  or MIME hints. Distinguish HEVC, AV1, and generic HEIF container signatures.
- Propagate worker startup and transport failures from metadata inspection rather
  than silently returning signature-only results.
- Reject FIFO filesystem inputs without blocking while waiting for a writer.
- Validate release tags without shell expansion, retaining useful mismatch messages.
- Check file growth and input limits while reading, and preserve cancellation errors
  when backend operations fail.

### Migration Notes

- Detection now requires a binary HEVC signature; generic `mif1`/`msf1` containers
  without an explicit HEVC brand no longer count as confirmed HEIC.
- `hasAlpha` is omitted unless `inspectAlpha: true` is requested.
- Default limits are 20 MiB of input and 25 million pixels. Override them explicitly
  for larger trusted inputs.
- Browser deployments must serve the emitted worker asset. Browsers without usable
  OffscreenCanvas encoding also need a DOM canvas.

## 0.1.1

### Added

- Added GitHub Actions workflows for CI and release publishing.
- Added format, lint, typecheck, coverage, package dry-run, and dist smoke-check scripts.
- Added 90% global coverage thresholds for the MVP test suite.
- Added project support documents: `CONTRIBUTING.md`, `SECURITY.md`, and `THIRD_PARTY_NOTICES.md`.
- Added additional `convertHeic`, `getHeicInfo`, input utility, and MIME utility tests with backend mocking where appropriate.

### Changed

- Improved README badges, Node.js example typing, project links, and licensing guidance.

## 0.1.0

### Added

- Initial MVP release.
- Added HEIC/HEIF detection with ISO BMFF `ftyp` brand inspection.
- Added single-image conversion API for JPEG, PNG, and WebP.
- Added browser and Node.js input support.
- Added TypeScript declarations and ESM package output.
- Added custom typed errors.
- Added README, examples, tests, and MIT license for wrapper code.
