# Third-Party Notices

heicraft uses third-party software for decoding and encoding images. This document identifies the principal runtime components, how they are distributed, and where to find their source and license information.

**Version scope:** These notices describe the 0.3.0 dependency stack. For the older 0.1.1 package, use the [0.1.1 notices](https://github.com/ragnarok22/heicraft/blob/v0.1.1/THIRD_PARTY_NOTICES.md) and the licenses distributed with that version.

It is a licensing summary, **not an exhaustive dependency inventory, source offer, or compliance certification**. Upstream license texts and notices govern their respective components. This document is informational and is not legal advice.

## Project-Owned Code

The heicraft wrapper/library source code is licensed under the [MIT License](./LICENSE). That license does not relicense third-party code, WebAssembly, native libraries, or browser implementations.

## Runtime Dependency Summary

| Component                                                        | Version in the current lockfile | Role                                                                          | Declared license |
| ---------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- | ---------------- |
| [`libheif-js`](https://github.com/catdad-experiments/libheif-js) | `1.23.5`                        | HEIC/HEIF decoding through an Emscripten/WebAssembly distribution of libheif. | `LGPL-3.0`       |
| [`sharp`](https://github.com/lovell/sharp)                       | `0.35.5`                        | JPEG, PNG, and WebP output encoding in Node.js.                               | `Apache-2.0`     |

These versions describe the repository's current `pnpm-lock.yaml`. Applications may resolve different versions within the ranges in `package.json`. Transitive components and native binaries have additional licenses; inspect the versions and notices actually installed or redistributed.

## HEIC Decoding

heicraft imports `libheif-js/wasm-bundle.js` inside decoder workers. This distribution embeds WebAssembly in JavaScript and uses [libheif](https://github.com/strukturag/libheif) and its compiled codec dependencies.

### Browser Distribution

- The build bundles the decoder distribution into `dist/browser-worker.js`.
- That worker receives an attribution banner identifying `libheif-js`, its LGPL license, and its upstream repository.
- The build copies the upstream `libheif-js/LICENSE` text to `dist/libheif-js.LICENSE`, which is included in the npm package.
- An application bundler may transform or rename worker assets. Preserve the attribution and accompanying license information in the artifacts you distribute.

### Node.js Distribution

The Node.js worker loads the installed `libheif-js` dependency rather than embedding it in the Node.js worker asset. Its package contains its own license text. If your deployment bundles or copies that dependency, account for it in the resulting distribution.

### Upstream References

- [libheif-js source, usage, and build information](https://github.com/catdad-experiments/libheif-js).
- [libheif source and codec/build documentation](https://github.com/strukturag/libheif).
- Installed `node_modules/libheif-js/package.json` and `node_modules/libheif-js/LICENSE` for the resolved package's declarations and license text.

The exact compiled libheif and codec configuration matters. Do not assume that a top-level npm license field describes every compiled component or every possible build.

## Node.js Encoding

Sharp is Apache-2.0 licensed. Its upstream attribution is **Copyright 2013 Lovell Fuller and others**; see the installed `node_modules/sharp/LICENSE` and [Sharp repository](https://github.com/lovell/sharp).

Sharp's Apache license does **not** cover its entire native dependency stack. Native libvips distributions include LGPL-licensed code and other separately licensed image/codec libraries. The components vary with the platform, package version, and whether you use prebuilt or custom binaries.

For prebuilt installations, inspect the installed `@img/sharp-*` and `@img/sharp-libvips-*` packages, including their `package.json`, `README.md`, license/notice files where supplied, and `versions.json` where present. For example, the lockfile's `@img/sharp-libvips-darwin-arm64@1.3.4` distribution declares `LGPL-3.0-or-later` and lists individual component licenses in its README.

Upstream references:

- [Sharp installation and platform information](https://sharp.pixelplumbing.com/install/).
- [sharp-libvips prebuilt distributions and build information](https://github.com/lovell/sharp-libvips).
- [libvips source](https://github.com/libvips/libvips).

Sharp is used for Node.js encoding, not browser canvas encoding. Its native binaries are installed as dependencies, not embedded into heicraft's browser worker.

## Browser Encoding

Browser output encoding uses the host browser's OffscreenCanvas API in the decoder worker when available, or its DOM canvas API as a fallback. heicraft does not ship those browser implementations or their encoders. Supported output types depend on the selected browser encoder.

## Redistribution and Notice Preservation

When redistributing heicraft, dependencies, or bundled application assets:

- Retain applicable copyright notices, attribution, license texts, and any required upstream notices.
- Review the **actual distributed artifacts**, including worker bundles, embedded WebAssembly, and platform-specific native libraries, rather than only the application's top-level dependencies.
- Review the relevant licenses when modifying or combining LGPL-covered code. Depending on the distribution, obligations can include corresponding source/build material and a way to modify, replace, or recombine the covered library.
- Do not treat an attribution banner, this summary, or an upstream repository link as proof that all distribution obligations have been satisfied.
- Repeat the review when dependency versions, codec builds, platforms, or bundling arrangements change.

The LGPL text incorporates terms of the GNU GPL. Consult the applicable versions of the [GNU LGPL](https://www.gnu.org/licenses/lgpl-3.0.html) and [GNU GPL](https://www.gnu.org/licenses/gpl-3.0.html), along with the component's own notices, when assessing requirements.

## Codec Patents

HEIC/HEIF may use codecs, including HEVC, that are subject to patent claims or licensing requirements. Software copyright licenses do not by themselves settle codec-patent obligations for every use, distribution model, or jurisdiction. Obtain qualified legal advice where appropriate.
