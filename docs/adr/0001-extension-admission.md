# ADR 0001: Extension Admission and Gating Framework

## Status
Accepted

## Context
Developer Toolbox is designed as a secure, fast, offline-capable developer workbench. As the product expands, new capabilities (e.g. larger-corpus search engines, real-time collaboration relays, external IDE plugins, and AI model gateways) may be proposed. Without explicit admission standards, the core Docker container risks architectural bloat, telemetry leaks, and memory footprint degradation.

## Decision
1. **Core Preservation**: The base Docker image must remain functional, private, and fully local-first with zero external dependencies when all extension flags are disabled.
2. **Feature Flags**: Every extension must implement the `extensions.Extension` interface and remain off by default. Extensions are activated only through explicit environment variables named `TOOLBOX_FEATURE_<NAME>=true`.
3. **Health & Lifecycle**: Every admitted extension must expose a health check under `/api/extensions/{name}/health`.
4. **Admission Checklist**: No extension will be admitted to the mainline codebase without:
   - Documented workload/corpus metrics proving default SQLite FTS5/local stores are insufficient.
   - Separate deployment profile (e.g. Compose profile) without modifying base container port bindings.
   - Privacy and data retention threat model ensuring zero secret or source code leakage.
   - Defined rollback and uninstallation procedure.

## Consequences
- The core footprint remains below 60 MB RAM and < 150 MB image size.
- New integrations cannot introduce undocumented background network requests.
