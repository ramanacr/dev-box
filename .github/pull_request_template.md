## What changed

<!-- What a user or operator gets out of this. Not a list of edited files. -->

## Why

<!-- The problem, or a link to the issue. If this commits the project to a
     technology or a security posture, link the ADR under docs/adr/. -->

## How it was verified

<!-- What you actually ran, and what it said. "Tested locally" is not an answer. -->

- [ ] `pnpm lint`
- [ ] `pnpm test` and `go test -race ./...`
- [ ] `pnpm e2e` (if routes, headers, CSP or search changed)
- [ ] Core profile with every `TOOLBOX_FEATURE_*` flag unset (if `internal/features`
      or `internal/config` changed)
- [ ] Image builds and `/readyz` responds (if `Dockerfile` or `compose.yaml` changed)

## Risk

<!-- What breaks if this is wrong, and how an operator would notice. -->

- [ ] This changes an HTTP contract (note it, and whether it is breaking)
- [ ] This touches identity, roles, or workspace membership
- [ ] This changes what is logged or audited
- [ ] This adds or upgrades a dependency
- [ ] None of the above

## Rollback

<!-- Revert, or something more involved? Say so if this writes to the workspace
     database or migrates a schema, since those do not roll back with the commit. -->
