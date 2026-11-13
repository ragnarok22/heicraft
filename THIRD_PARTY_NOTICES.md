# Third-Party Notices

This document summarizes important third-party dependency licensing notes for `heicraft`.

## heicraft Wrapper Code

The `heicraft` wrapper/library source code is licensed under the MIT License. See [LICENSE](./LICENSE).

## HEIC Decoding

The HEIC decoder backend is [`libheif-js`](https://www.npmjs.com/package/libheif-js), an Emscripten distribution of `libheif` technology for Node.js and browsers. `heicraft` uses its bundled WebAssembly build directly.

The browser decoder worker includes that distribution with attribution in the emitted asset and its upstream license in `dist/libheif-js.LICENSE`. The Node.js worker loads the installed `libheif-js` dependency. Upstream source, build instructions, and licensing information are available at [catdad-experiments/libheif-js](https://github.com/catdad-experiments/libheif-js).

Important licensing notes:

- `libheif-js` is LGPL-3.0 licensed.
- `libheif` and related codec components may have their own licensing terms and patent considerations depending on usage and distribution context.
- Users should review all dependency licenses before using this package in commercial or closed-source products.

## Node.js Encoding

Node.js output encoding uses [`sharp`](https://www.npmjs.com/package/sharp), which has its own license and native dependency stack.

## Browser Encoding

Browser output encoding uses the platform canvas API and depends on browser support for the requested output MIME type.

## Notice Preservation

`heicraft` does not intentionally hide, rename, bundle away, or obscure third-party license notices. Consumers should inspect installed dependencies and their license files as part of their own compliance process.

This document is informational and is not legal advice.
