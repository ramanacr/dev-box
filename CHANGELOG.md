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
