# Contributing

Thanks for helping improve `heicraft`.

## Development Setup

Work from a repository checkout, not the published npm package. The `main` branch may include changes beyond the latest release; the [README](./README.md) identifies the documented API version.

Prerequisites:

- **Node.js 26**, recommended by [`.nvmrc`](./.nvmrc). Node.js 22.13.0 or later on the 22.x line, 24.x, and 26.x are supported; use the latest patch release of your chosen line.
- **pnpm 12.18.0**, pinned by `packageManager` in [`package.json`](./package.json).

If you use [nvm](https://github.com/nvm-sh/nvm), select the repository's Node.js version from its root:

```sh
nvm install
nvm use
```

If the pinned pnpm version is not already available, install it with npm:

```sh
npm install --global pnpm@12.18.0
```

Confirm your tools and install the locked dependencies:

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
```

Run the main checks:

```sh
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run coverage
pnpm run build
```

Before opening a pull request, also check the published package contents:

```sh
pnpm run pack:check
```

## Run the Browser Example

After the development setup above, run these commands from the repository root:

```sh
pnpm run build
pnpm exec vite build --config examples/vite.config.ts
pnpm exec vite preview --config examples/vite.config.ts --host 127.0.0.1
```

Open `http://127.0.0.1:4173/browser.html`, or append `/browser.html` to the local URL printed by Vite if it chooses another port. Select a HEIC/HEIF image; [`tests/fixtures/pattern.heic`](./tests/fixtures/pattern.heic) is a small, redistributable fixture you can use.

This builds [`examples/browser.html`](./examples/browser.html) against the local library's `dist` output, not a registry installation. The example assets go to `examples/dist`, separate from the package build. Rebuild both the library and example after changing library code; restart the preview server if needed.

Use the production build/preview commands, not a direct `file://` URL or `vite dev`. The current worker bundle is verified through Vite's production build; development-server dependency optimization is not currently supported by this example.

## Scope

Keep changes focused on the current library. Worker-based decoding is already part of the implementation. See [ROADMAP.md](./ROADMAP.md) for current capabilities and proposed CLI, batch, and longer-term work; a roadmap entry is not implementation approval. Discuss substantial API or scope changes in an issue before starting.

## Tests

- Add tests for detection, validation, error behavior, and public API changes.
- Do not fake successful HEIC conversion tests.
- If adding a real HEIC fixture, make sure it is small and has a clear license that allows repository redistribution.

The integration tests require the committed MIT-licensed
[`pattern.heic`](./tests/fixtures/README.md) fixture. They convert it to JPEG,
PNG, and WebP and decode the pixels, rather than only inspecting image headers.

The browser smoke test packs and extracts the actual npm artifact, reuses the
installed runtime dependencies offline, and builds a production Vite bundle from
that artifact. It runs real conversions in headless Chromium or WebKit and cross-decodes Node
outputs with that browser and browser outputs with Sharp, checking file signatures,
dimensions, and the fixture's quadrant colors. No conversion backends are mocked,
and a missing fixture or browser fails the check rather than skipping it. It also
checks OffscreenCanvas encoding, the DOM fallback, worker cancellation, rotation,
transparency, cross-realm inputs, and the worker-free detection entrypoint. Native
smoke jobs exercise workers and encoders on macOS and Windows without repeating
the full test suite. Use `pnpm test` for quick feedback without coverage; do not run
both test commands unless there is a specific reason to repeat the suite.

Install the browsers once, then build and run the smoke tests:

```sh
pnpm exec playwright install chromium webkit
pnpm run build
pnpm run smoke:browser
pnpm run smoke:browser webkit
pnpm run smoke:node
```

On Linux/CI, use `pnpm exec playwright install --with-deps chromium webkit` to also
install the browser's system dependencies.

## Licensing

Do not remove, hide, rename, bundle away, or obscure third-party license notices. HEIC decoding uses third-party dependencies with their own licenses. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
