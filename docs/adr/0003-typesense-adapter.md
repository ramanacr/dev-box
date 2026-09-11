# ADR 0003: Typesense Search Adapter Admission and Verification

## Status
Accepted (Gated)

## Context
SQLite FTS5 provides instantaneous search for standard packs (< 50,000 documents). When integrating enterprise-scale technical libraries (> 250,000 sections) or handling multi-word prefix typos, an external dedicated search engine can be beneficial.

## Decision
1. **Decision Gate Evaluation**:
   - Estimated search corpus: 250,000+ entries.
   - Fallback authority: SQLite FTS5 remains the offline bedrock.
2. **Architecture**:
   - `TypesenseBackend` acts as an optional HTTP client connecting to an internal container over Docker network `internal-search`.
   - No public host port exposure for Typesense; all access traverses the `developer-toolbox` HTTP API.
   - In case of failure or network timeout (2s), the query falls back to SQLite FTS5 automatically.

## Consequences
- Single-user mode remains standalone with zero external process dependencies.
- Enterprise deployments can deploy `compose.typesense.yaml` with zero client code alterations.
