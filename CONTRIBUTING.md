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

## Licensing

Do not remove, hide, rename, bundle away, or obscure third-party license notices. HEIC decoding uses third-party dependencies with their own licenses. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
