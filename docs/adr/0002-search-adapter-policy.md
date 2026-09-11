# ADR 0002: Search Backend Adapter and Fallback Policy

## Status
Accepted

## Context
SQLite FTS5 provides fast, embedded BM25 full-text search with zero network hops or memory overhead for corpora under 250,000 document sections. Teams with very large reference documentation or demanding typo-tolerance requirements may consider dedicated search engines like Typesense or Meilisearch.

## Decision
1. **SQLite FTS5 as Canonical Authority**: SQLite FTS5 remains the primary and authoritative local documentation store.
2. **Pluggable `SearchBackend`**: Dedicated search engines must be implemented as adapters behind the unified `SearchBackend` interface.
3. **Graceful Fallback**: If an external search adapter is unreachable, misconfigured, or returns a network error, the search service must automatically fall back to SQLite FTS5 without failing the client request.
4. **Secret Protection**: API keys and connection tokens for external search clusters must be treated as `Secret` types and never logged, emitted in error responses, or persisted in browser state.

## Consequences
- Single-node developers and offline containers experience zero disruption or overhead.
- Enterprise deployments with massive documentation packs can seamlessly enable Typesense via compose profiles.
