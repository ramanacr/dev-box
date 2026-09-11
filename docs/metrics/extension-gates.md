# Extension Metric Thresholds and Decision Gates

This document defines the quantitative gates required before optional extensions may be activated in production.

## 1. Search Adapter Gate (e.g. Typesense)
- [ ] **Corpus Size**: Total indexed document sections $\ge 250,000$.
- [ ] **Query Latency**: Sustained SQLite FTS5 p95 latency $> 250\text{ ms}$ under $\ge 20$ concurrent queries.
- [ ] **Feature Need**: Documented functional requirement for typo tolerance or facet filtering unachievable in SQLite FTS5.
- [ ] **Authority**: SQLite FTS5 maintained as fallback.

## 2. Real-time Collaboration Gate
- [ ] **Active Teams**: At least 3 teams actively sharing workspace definitions asynchronously.
- [ ] **Limitation Evidence**: At least 10 logged friction reports regarding concurrent drawing overlaps in `.excalidraw` whiteboard diagrams.
- [ ] **Network Control**: Authenticated WebSockets restricted to private networks; max 256 KB frames; 30 msgs/sec throttle.

## 3. IDE / MCP Local Integration Gate
- [ ] **Protocol**: Model Context Protocol (MCP) TypeScript SDK connecting via loopback `http://127.0.0.1:8080`.
- [ ] **Security**: No external outbound traffic; local token authentication; prompt isolation.

## 4. AI Assistance Gateway Gate
- [ ] **Consent**: Explicit interactive consent per request showing destination model and redacted payload preview.
- [ ] **Redaction**: 100% automated redaction of API keys, passwords, database URLs, and bearer tokens before transmission.
- [ ] **Audit Trail**: Audit log captures actor, timestamp, model target, and token count—never the raw prompt or response payload.
