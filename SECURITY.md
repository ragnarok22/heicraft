# Security Policy

This policy covers private vulnerability reporting and the security boundaries of processing HEIC/HEIF images with heicraft. Usage and option details belong in the [README](./README.md).

## Supported Versions

Security fixes target the **latest published version** of `heicraft`. Backports to older versions are not guaranteed.

When possible, check whether an issue still affects the latest release, but do not delay a report if you cannot safely verify it.

## Reporting a Vulnerability

Use GitHub's private reporting channel:

**[Report a vulnerability](https://github.com/ragnarok22/heicraft/security/advisories/new)**

You must sign in to GitHub. If the reporting form is unavailable, a repository administrator needs to [enable private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository). Do not use a public issue as a fallback for vulnerability details or exploit files.

Include enough information to investigate:

- Affected heicraft version and, if known, relevant dependency versions.
- Node.js or browser version, operating system, and bundler/deployment details.
- A description of the issue, expected behavior, and observed impact.
- Minimal reproduction steps or code, including resource-limit and cancellation options.
- A small reproduction file, only if it is safe and permitted to share privately.
- Any known mitigation or workaround.

Remove personal images, location/EXIF data, credentials, and unrelated application data from reproductions. Keep potentially malicious samples in the private report; do not upload them to public issues or pull requests.

Ordinary bugs and feature requests without security-sensitive information can use [GitHub issues](https://github.com/ragnarok22/heicraft/issues).

## Coordinated Disclosure

Please keep vulnerability details private while they are assessed and coordinate public disclosure with the maintainers. Investigation or fixes may depend on upstream decoder and encoder projects.

No fixed acknowledgement or resolution time is guaranteed. Do not interpret the absence of published advisories as evidence that the library or its dependencies are vulnerability-free.

## Handling Untrusted Images

**Version scope:** The resource limits and worker behavior below target upcoming 0.3.0 on `main`. The published **0.1.1** package does not provide these byte/pixel limits or worker-based decoding; do not rely on them when deploying that version. See its [versioned README](https://github.com/ragnarok22/heicraft/blob/v0.1.1/README.md) for the released API.

Image parsing, decompression, and encoding are resource-intensive operations over attacker-controlled data. Treat uploaded images as untrusted even if their filename, MIME type, or detected signature looks correct.

### What the Library Limits

- The default input-size limit is **20 MiB** for all public entry points.
- Conversion and metadata inspection default to **25 million pixels** for the image being inspected. Dimensions are checked before allocating output RGBA or rendering pixels.
- Conversion and metadata work have bounded admission and decoder queue sizes per loaded library instance. Conversion admission is retained through output encoding.
- `AbortSignal` can cancel input reading, queued decoding, or an active worker, including worker-side browser encoding.

See [Resource Limits](./README.md#resource-limits) and [Workers and Cancellation](./README.md#workers-and-cancellation) for exact API behavior.

### What Those Limits Do Not Guarantee

- A signature check is not full container or payload validation, and does not establish that an image is safe to decode.
- Byte and pixel limits are **not total memory, CPU, or execution-time budgets**. The backend parses compressed data before dimensions can be checked, and parsing, decoding, and encoding can allocate additional memory.
- Metadata inspection still loads the complete compressed input. Opt-in transparency inspection may also decode pixels.
- Worker-based decoding improves responsiveness and cancellation; it is **not a security sandbox**. In particular, Node.js worker threads share a process.
- Internal admission limits include output encoding but are not process-wide request or memory limits.
- Cancellation does not interrupt an already-running Sharp or fallback DOM canvas encoder. A rejected or cancelled call is not a hard execution deadline.

### Application Responsibilities

- Set upload-size limits before buffering request bodies. Limits on an already allocated `Buffer` cannot reclaim that allocation.
- Choose `maxInputBytes` and `maxPixels` for your workload. Raising them increases resource exposure.
- Bound concurrent requests and conversions at the application level, including output encoding.
- For hostile workloads, use an appropriately restricted process or container with external memory/CPU limits and enforceable deadlines.
- Run with least privilege. If accepting filesystem paths, authorize them in your application; heicraft is not a path-access policy layer.
- Keep private images and reproduction samples out of public logs and error reports.

## Dependency Security

In the upcoming 0.3.0 release, HEIC decoding uses `libheif-js`/libheif WebAssembly. Node.js output encoding uses `sharp` and its native dependency stack; browser output encoding uses the platform OffscreenCanvas or DOM canvas API.

Keep resolved dependencies and the host runtime updated, review upstream advisories, and test upgrades against your workload. A heicraft version alone does not identify every transitive or platform-specific binary in your deployment.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for upstream projects and licensing references. Report vulnerabilities affecting heicraft's integration privately even when a dependency may be involved.
