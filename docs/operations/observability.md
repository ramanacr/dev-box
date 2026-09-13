# Observability and operational controls

What the service reports about itself, how to throttle it, and how to read and
retain its audit trail.

## Build identity

`GET /healthz` is the liveness probe and also reports which binary is running.

```console
$ curl -s http://127.0.0.1:8080/healthz
{"status":"ok","version":"v1.2.0","commit":"a1b2c3d","build_date":"2026-09-13T10:40:19Z","go_version":"go1.27.0","platform":"linux/amd64"}
```

`"status":"ok"` is the first key and keeps its exact historical value, so an
existing probe that greps for it keeps working.

A binary built with a plain `go build` reports `dev`, or `dev-dirty` from a tree
with uncommitted changes, rather than inventing a version. Only the release
workflow stamps a real one. **If a production instance reports `dev`, it was not
built by the release pipeline** — treat that as the finding, not as a display bug.

The same identity is exported as a metric, so a dashboard can group by version
and a deploy is visible as a change in series:

```
toolbox_build_info{commit="a1b2c3d",go_version="go1.27.0",version="v1.2.0"} 1
```

## Metrics

`GET /metrics` serves Prometheus text exposition format (`version=0.0.4`). Every
enterprise monitoring stack scrapes this directly, and the OpenTelemetry
Collector ingests it through the `prometheus` receiver.

| Metric | Type | Labels |
| ------ | ---- | ------ |
| `toolbox_http_requests_total` | counter | `method`, `route`, `status` |
| `toolbox_http_request_duration_seconds` | histogram | `method`, `route` |
| `toolbox_http_response_size_bytes` | histogram | `method`, `route` |
| `toolbox_http_requests_in_flight` | gauge | `route` |
| `toolbox_build_info` | gauge | `version`, `commit`, `go_version` |

### Cardinality

`route` is a **pattern**, never a path. `/api/docs/typescript/interfaces` and
`/api/docs/regex/backtracking` both report as `/api/docs/{id}`, and any path
outside the known set collapses to `other`. Unknown HTTP verbs collapse to
`other` as well. An unbounded metric label is an incident in the monitoring
system, not a gap in it.

### Duration buckets

Buckets start at 0.5 ms and run to 10 s. Measured search p95 is 2.84 ms, so the
conventional 100 ms first bucket would hold every normal request and measure
nothing.

### Privacy

The endpoint carries no request content: no query strings, no bodies, no document
titles. This is enforced by a test, because `/metrics` is the one surface
designed to be scraped off the machine.

### Example queries

```promql
# Request rate by route
sum by (route) (rate(toolbox_http_requests_total[5m]))

# Error ratio
sum(rate(toolbox_http_requests_total{status=~"5.."}[5m]))
  / sum(rate(toolbox_http_requests_total[5m]))

# Search latency p95
histogram_quantile(0.95,
  sum by (le) (rate(toolbox_http_request_duration_seconds_bucket{route="/api/docs/search"}[5m])))

# Requests being shed by the rate limiter
sum by (route) (rate(toolbox_http_requests_total{status="429"}[5m]))
```

## Request correlation

Every response carries `X-Request-Id`, and every request log line carries the
same value as `request_id`.

- If the caller or an upstream proxy already sent `X-Request-Id`, that value is
  kept, so one request can be followed across the whole hop chain.
- Otherwise a 128-bit random id is generated.
- An id containing anything outside `[A-Za-z0-9._-]` is discarded and replaced,
  which is what stops a hostile header from injecting lines into the log stream.

A valid W3C `traceparent` additionally contributes `trace_id` to the log line, so
entries line up with spans from services that do emit traces. The service does
not create spans of its own.

```json
{"time":"2026-09-13T10:40:19Z","level":"INFO","msg":"http_request","method":"GET","path":"/api/docs/search","status":200,"duration_ms":3,"request_id":"0e9d551550a7e2d693fea7f4729cbf35"}
```

The log records method, path, status and duration only. Query strings and request
bodies are never logged — the local-first promise covers the log file too.

## Rate limiting

Enabled by default. Callers are keyed by authenticated principal where there is
one and by source address otherwise, so an office behind one NAT address does not
share a single bucket.

| Route class | Sustained | Burst |
| ----------- | --------- | ----- |
| Reads (search, documents, static assets) | `TOOLBOX_RATE_LIMIT_RPS` (default 50/s) | `TOOLBOX_RATE_LIMIT_BURST` (default 100) |
| Writes and gateways (upload, custom docs, AI, pack activation) | RPS ÷ 20 | Burst ÷ 10 |
| `/healthz`, `/readyz` | never limited | — |

Health and readiness are deliberately exempt: a probe that fails under load turns
a busy service into a restarting one.

A refused request returns `429` with `Retry-After` (whole seconds, never `0`) and
the `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` headers.

**Forwarded headers are ignored.** `X-Forwarded-For` and `X-Real-IP` are
caller-controlled, so honouring them would let anyone bypass the limit by varying
a string — worse than no limit, because it looks like one. If you terminate TLS
at a proxy, enforce your per-client limit there, where the real peer is known.

**The limiter is per-instance.** Running several replicas behind a load balancer
gives each replica its own budget.

## Audit trail

Available in team mode. Both endpoints require the installation-wide admin
capability (`manage-packs`), because the trail spans every workspace — a
workspace admin must not read another team's activity through it. Refused
attempts are logged at `WARN`.

```console
# Newest first, 100 per page by default
$ curl -H "Authorization: Bearer $TOKEN" \
    'http://127.0.0.1:8080/api/team/admin/audit?limit=50'

# Filter by actor, action, target and window
$ curl -H "Authorization: Bearer $TOKEN" \
    'http://127.0.0.1:8080/api/team/admin/audit?action=create-workspace&since=2026-03-01T00:00:00Z'

# Full CSV export for a compliance request
$ curl -H "Authorization: Bearer $TOKEN" \
    -o audit.csv 'http://127.0.0.1:8080/api/team/admin/audit.csv'
```

| Parameter | Meaning |
| --------- | ------- |
| `actor` | Exact principal subject |
| `action` | Exact action name, e.g. `create-workspace` |
| `target` | Exact target id, typically a workspace |
| `since` / `until` | RFC 3339. `since` inclusive, `until` exclusive |
| `limit` | 1–1000, default 100. A larger value is clamped, not rejected |
| `cursor` | `nextCursor` from the previous page |

A malformed filter returns `400` rather than being ignored — silently returning
the unfiltered trail would let an auditor draw conclusions from the wrong window.

### Paging

Paging is keyset on a monotonic id, not offset. Follow `nextCursor` until it is
`0`; do not infer the end from a short page.

```
GET /api/team/admin/audit?limit=100          → nextCursor: 4821
GET /api/team/admin/audit?limit=100&cursor=4821 → nextCursor: 4721
GET /api/team/admin/audit?limit=100&cursor=4721 → nextCursor: 0   (done)
```

Offset paging would skip or repeat rows when new events land mid-export, which
for an audit trail is a correctness failure. The CSV export walks every page
itself for the same reason — a half-exported trail is worse than none, because it
looks complete.

### Retention

`TOOLBOX_AUDIT_RETENTION_DAYS` deletes records older than the given window. The
sweep runs at startup and every 24 hours, and logs whenever it deletes anything,
because deleting audit records is itself an auditable act.

**The default is `0`, meaning keep everything.** The service cannot know your
retention obligation — a compliance regime setting a minimum is as likely as a
privacy regime setting a maximum — and deleting evidence nobody asked to have
deleted is the worse failure.

Lowering the window takes effect on the next restart, not up to a day later.

## Configuration reference

| Variable | Default | Effect |
| -------- | ------- | ------ |
| `TOOLBOX_LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. An unrecognised value fails startup rather than being silently ignored. |
| `TOOLBOX_METRICS_ENABLED` | `true` | Serves `/metrics`. Set `false` when publishing the port somewhere less private than loopback. |
| `TOOLBOX_RATE_LIMIT_ENABLED` | `true` | Per-caller throttling. |
| `TOOLBOX_RATE_LIMIT_RPS` | `50` | Sustained rate for reads. |
| `TOOLBOX_RATE_LIMIT_BURST` | `100` | Bucket depth for reads. |
| `TOOLBOX_AUDIT_RETENTION_DAYS` | `0` | Prune audit records older than this. `0` keeps everything. |

## Scraping the container

`/metrics` is served on the same port as the application. With the default
`compose.yaml`, which publishes to loopback only:

```yaml
scrape_configs:
  - job_name: developer-toolbox
    static_configs:
      - targets: ['127.0.0.1:8080']
```

There is no authentication on `/metrics`. That matches the default deployment,
which is loopback-only. If you publish the port on a shared network, either put
the endpoint behind your own proxy or set `TOOLBOX_METRICS_ENABLED=false`.
