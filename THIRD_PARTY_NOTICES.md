# Third-Party Notices

This document summarizes important third-party dependency licensing notes for `heicraft`.

## heicraft Wrapper Code

The `heicraft` wrapper/library source code is licensed under the MIT License. See [LICENSE](./LICENSE).

## HEIC Decoding

The initial HEIC decoder backend is [`heic-decode`](https://www.npmjs.com/package/heic-decode).

`heic-decode` depends on [`libheif-js`](https://www.npmjs.com/package/libheif-js), which is an Emscripten distribution of `libheif` technology for Node.js and browsers.

Important licensing notes:

- `heic-decode` has its own license.
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
