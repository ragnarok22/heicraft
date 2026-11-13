# Contributing

Thanks for helping improve `heicraft`.

## Development Setup

Install dependencies:

```sh
pnpm install
```

Run the main checks:

```sh
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run coverage
pnpm run build
```

Before opening a pull request, also check the published package contents:

```sh
pnpm run pack:check
```

## Scope

Keep the MVP focused. Avoid adding CLI support, batch conversion, Web Workers, React hooks, advanced resizing, EXIF editing, streaming, or multi-image extraction unless the roadmap explicitly moves those features into scope.

## Tests

- Add tests for detection, validation, error behavior, and public API changes.
- Do not fake successful HEIC conversion tests.
- If adding a real HEIC fixture, make sure it is small and has a clear license that allows repository redistribution.

The integration tests require the committed MIT-licensed
[`pattern.heic`](./tests/fixtures/README.md) fixture. They convert it to JPEG,
PNG, and WebP and decode the pixels, rather than only inspecting image headers.

The browser smoke test builds a production Vite bundle from the package entry
point and runs real conversions in headless Chromium. It also cross-decodes Node
outputs with Chromium and browser outputs with Sharp, checking file signatures,
dimensions, and the fixture's quadrant colors. No conversion backends are mocked,
and a missing fixture or browser fails the check rather than skipping it.

Install Chromium once, then build and run the smoke test:

```sh
pnpm exec playwright install chromium
pnpm run build
pnpm run smoke:browser
```

On Linux/CI, use `pnpm exec playwright install --with-deps chromium` to also
install the browser's system dependencies.

## Licensing

Do not remove, hide, rename, bundle away, or obscure third-party license notices. HEIC decoding uses third-party dependencies with their own licenses. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
