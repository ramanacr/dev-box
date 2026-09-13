# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning applies to the HTTP API, the configuration surface
(`TOOLBOX_*` environment variables), the container image, and the documentation
pack format. Internal Go packages are not a public API and may change in any
release.

## [Unreleased]

### Added

- `GET /api/team/admin/audit` and `GET /api/team/admin/audit.csv` expose the
  audit trail with filtering by actor, action, target and time window, and
  keyset paging that stays correct while new records are being written. Both
  require the installation-wide admin capability.
- `TOOLBOX_AUDIT_RETENTION_DAYS` prunes audit records older than the given
  window, swept at startup and daily. Zero, the default, keeps everything.
- A container `HEALTHCHECK`, implemented as a `healthcheck` subcommand on the
  binary itself so the distroless base does not have to gain a shell or curl to
  get one. It probes `/readyz` over loopback.
- `compose.yaml` now runs with a read-only root filesystem, all capabilities
  dropped, `no-new-privileges`, a 16 MB tmpfs for `/tmp`, memory limits and log
  rotation, and spells out the operational environment variables at their
  defaults.
- Per-caller HTTP rate limiting on every route except `/healthz` and `/readyz`,
  which are never limited so an orchestrator cannot probe itself out of the
  cluster. Write and gateway routes (upload, AI, pack activation) are held to a
  tighter limit than reads. Refusals return 429 with `Retry-After` and the
  `RateLimit-*` headers. Configured with `TOOLBOX_RATE_LIMIT_ENABLED`,
  `TOOLBOX_RATE_LIMIT_RPS` and `TOOLBOX_RATE_LIMIT_BURST`.
- A `/metrics` endpoint in Prometheus text exposition format, covering request
  counts, duration and response-size histograms, in-flight gauge and build info.
  Enabled by default; `TOOLBOX_METRICS_ENABLED=false` turns it off. Route labels
  come from a bounded allowlist, so a document or workspace id in the path can
  never mint a new time series.
- A request id on every response (`X-Request-Id`) and every request log line. An
  id supplied by an upstream proxy is preferred over a generated one, so a request
  can be followed across the whole hop chain. A valid W3C `traceparent` also
  contributes `trace_id` to the log line.
- `TOOLBOX_LOG_LEVEL` (`debug`, `info`, `warn`, `error`) so an operator can raise
  log verbosity during an incident without a rebuild. An unrecognised value is
  rejected at startup rather than silently ignored.
- Build identity is stamped into the binary at link time and reported on
  `/healthz` as `version`, `commit`, `build_date`, `go_version` and `platform`.
  An unstamped build reports `dev` rather than inventing a version number, so a
  local build can never be mistaken for a release in a bug report.
- A release workflow, triggered by a `v*.*.*` tag, that re-runs the full test
  suite, builds binaries for five platforms, publishes a multi-architecture
  image to GHCR, signs it keylessly with cosign, and attaches a signed SPDX SBOM
  attestation to the image digest.
- OCI image annotations (`org.opencontainers.image.*`) so the image describes its
  version, revision and source without reference to the build that made it.
- `SECURITY.md` with a private reporting channel, scope, and response targets.
- `CONTRIBUTING.md`, `CODEOWNERS`, a pull request template, and Dependabot
  configuration for Go modules, npm, Docker and GitHub Actions.

### Security

- `govulncheck` now scans the Go module tree in CI and fails the build on any
  vulnerability reachable from this code. Trivy scans the image, which covers OS
  packages; the project's own dependencies were previously unscanned.
- `golang.org/x/sys` upgraded from v0.30.0 to v0.44.0, clearing GO-2026-5024
  (integer overflow in `NewNTUnicodeString`). It was never reachable from this
  code and is Windows-only while the image is Linux, but the fix was a version
  bump, so the finding is closed rather than argued with.
- `pnpm audit` now runs in CI. Runtime dependencies fail the build at high or
  critical severity; the full tree including dev tooling is reported as an
  artifact without blocking, so advisories against a test runner cannot wedge
  the pipeline.

### Known issues

- GHSA-82fw-gwwq-j7x9 (moderate) affects `vitest` and `@vitest/mocker` in the
  dev dependency tree. The fix is vitest 4.1.11, a major upgrade across three
  workspace packages. No published artifact contains vitest.

### Changed

- Every GitHub Actions reference is pinned to a full commit SHA.
  `aquasecurity/trivy-action` previously tracked `@master`, which let an upstream
  push change what ran inside the build.
- `/healthz` returns build identity alongside `status`. The `"status":"ok"` pair
  is unchanged and remains the first key, so existing probes keep matching.

## Release history

No versioned release has been cut yet. `v0.1.0` will be the first, and this
section will carry one entry per release from that point.

[Unreleased]: https://github.com/ramanacr/dev-box/compare/main...HEAD
