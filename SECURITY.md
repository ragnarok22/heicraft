# Security Policy

## Supported Versions

Security fixes are handled for the latest published version of `heicraft`.

## Reporting a Vulnerability

Please report security issues privately through GitHub Security Advisories if available for the repository. If advisories are not available, contact the project maintainer privately before opening a public issue.

Include:

- A clear description of the issue.
- Steps to reproduce, if safe to share.
- Affected versions.
- Any known workaround.

Do not include malicious files or exploit payloads in public issues.

## Dependency Security

`heicraft` relies on third-party decoding and image-processing dependencies. Keep dependencies updated and review their advisories before deploying in production.

## Untrusted Inputs

Input size is limited to 20 MiB by default. Conversion and metadata inspection are also limited to 25 million pixels, checked before allocating RGBA or rendering. Configure `maxInputBytes` and `maxPixels` per call to match your workload; increasing them increases resource exposure.

These are not total memory or execution-time limits. Native parsing/decoding and output encoding require additional resources. Use process/worker isolation and concurrency limits for hostile inputs. See the README's resource-limit documentation for API behavior.
