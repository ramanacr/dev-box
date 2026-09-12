# ADR 0003: Typesense Search Adapter Admission and Verification

## Status

**Implemented but gate NOT MET — the feature ships disabled and must stay disabled.**

The Phase 4 plan permits the adapter to be written only after measured evidence
passes the search gate. That evidence does not exist. This record was previously
marked "Accepted (Gated)" on the basis of an *estimated* corpus size, which the
delivery standard explicitly forbids: "Performance claim — label as a target until
measured."

## Context

SQLite FTS5 serves the shipped packs with no separate process. An external search
engine only earns its operational cost at a corpus size and query profile that FTS5
cannot serve, or when typo tolerance and faceting become requirements.

## Decision gate

The adapter may only be enabled in a deployment once **all three** conditions are
measured and recorded below.

| Gate condition | Required | Measured | Status |
| --- | --- | --- | --- |
| Indexed sections | ≥ 250,000 | Core pack holds a small seed corpus (tens of documents) | **NOT MET** |
| FTS5 p95 search latency under the agreed concurrent-user test | > 250 ms | Not measured; observed single-query latency on the seed corpus is single-digit milliseconds | **NOT MET** |
| Documented requirement for typo tolerance or faceting that FTS5 cannot meet | Written requirement from a user | None recorded | **NOT MET** |

Until every row reads MET with a real measurement and a date, `TOOLBOX_FEATURE_TYPESENSE`
must remain unset in every deployment. The code exists so the interface is proven and
reviewable, not because the need is demonstrated.

## Options

1. **Keep FTS5 only.** No second process, no mirror to keep consistent, no extra
   SBOM or threat model. This is the current and recommended state.
2. **Typesense behind the `SearchBackend` interface, off by default.** Adds typo
   tolerance and faceting at large corpus sizes, at the cost of a second container,
   a mirroring job, and a divergence risk between the mirror and the authority.
3. **Embedded vector or semantic search.** Rejected by the white paper for v1: it
   adds an embedding model, reindexing, device-specific performance, and data
   governance questions, and does not improve exact matches on API names, error
   codes, and flags — which is what documentation search is actually used for.

## Decision

Option 1 in practice; option 2 implemented but disabled, so that the adapter is a
reviewed, tested component ready for a deployment that later passes the gate.

## Architecture

- `search.TypesenseBackend` implements `docs.Searcher`, so enabling it swaps the
  search implementation without changing the `/api/docs/search` contract.
- **FTS5 remains the content authority.** Typesense is a query mirror only. Any
  transport error or 2-second timeout falls back to FTS5 automatically, so a failed
  mirror degrades latency rather than availability.
- `MirrorPack` streams documents from the pack in batches of 200 through the
  Typesense import endpoint. Documents are streamed rather than materialised: a corpus
  large enough to pass this gate must not be loaded into memory to mirror it.
- `EnsureCollection` treats an existing collection as success, so mirroring is
  idempotent and safe to re-run.
- The compose profile binds Typesense to an internal Docker network with no host
  port; all access traverses the toolbox API.
- The API key is held in a `search.Secret` whose `String()` renders `••••••••`, so it
  cannot be printed by accident, and transport errors are replaced with synthetic
  messages rather than wrapped.

## Consequences

- Core single-user mode has zero external process dependencies.
- A deployment that passes the gate enables one flag and runs one mirror call.
- The mirror can drift from the authority between mirror runs. This is acceptable
  because FTS5 answers on fallback and remains the source of document content.

## Verification

- `go test ./internal/search` covers collection creation, idempotent upsert, query
  mapping, timeout, fallback to FTS5 on an unavailable backend, and that API keys
  never appear in errors.
- `go test ./internal/features` proves the extension mounts only when the flag is
  set, and that the core profile registers no Typesense route at all.
- **Before enabling in any deployment:** record the three measured gate values in the
  table above with the date and the environment they were measured on.
