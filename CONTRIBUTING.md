# Contributing

Thanks for working on the Developer Toolbox. This file covers how to get the
project running, what the gates are, and how changes are expected to be shaped.

## Prerequisites

| Tool | Version | Why |
| ---- | ------- | --- |
| Go | 1.27 | The server. `go.mod` pins the language version. |
| Node.js | 22 | The web build, and `node:sqlite` for the pack builder. |
| pnpm | via corepack | Run `corepack enable && corepack install`. The version comes from `packageManager` in `package.json`, so CI and the container cannot drift. |
| Docker | any recent | Only needed to build or test the image. |

## Getting started

```sh
corepack enable && corepack install
pnpm install --frozen-lockfile

# The documentation pack is a build product, not a tracked file. Anything that
# searches documentation needs it to exist first.
pnpm pack:build:core

pnpm --filter @toolbox/web build
go run ./cmd/toolbox-server
```

The server comes up on `http://127.0.0.1:8080`.

## The gates

CI runs these, and so should you before opening a pull request.

```sh
pnpm lint          # web lint + go vet
pnpm test          # workspace tests + go test
go test -race ./...
pnpm e2e           # Playwright, boots the real Go server
pnpm budgets       # bundle size budgets
gofmt -l cmd internal   # must print nothing
```

`gofmt` is a hard gate rather than a suggestion: an unformatted tree hides real
diffs in review.

### Extension profiles

Every extension is off unless its `TOOLBOX_FEATURE_<NAME>` flag is set, and the
core image must keep working with all of them false. If you touch
`internal/features` or `internal/config`, run the core profile explicitly:

```sh
TOOLBOX_TEAM_MODE= TOOLBOX_FEATURE_TYPESENSE= \
TOOLBOX_FEATURE_COLLABORATION= TOOLBOX_FEATURE_AI= \
  go test ./...
```

## How changes are shaped

**Commits** follow Conventional Commits — `feat:`, `fix:`, `docs:`, `test:`,
`ci:`, `deps:`, `refactor:`. The release notes are generated from them, so the
subject line is user-facing text. Write what changed for someone running the
toolbox, not what you edited.

**Comments explain why, not what.** The codebase has a consistent voice: a comment
earns its place by recording a decision or a trap that the code cannot show on its
own. The bind-address comment in `Dockerfile` is the model — it explains why the
container binds `0.0.0.0` when the Go default is loopback, so nobody "fixes" it
back into a broken state.

**Architecture decisions get an ADR.** If a change commits the project to a
technology, a protocol, or a security posture, add a numbered file under
`docs/adr/`. Reviewers will ask for one rather than infer the reasoning later.

**Tests come with the change.** New routes need handler tests; new parsing needs
table tests. Anything touching identity or workspace membership needs a test that
asserts the *denied* case, not only the allowed one.

## Security

Do not open a public issue or pull request for a vulnerability. See
[SECURITY.md](SECURITY.md) for the private reporting channel and response targets.

## Pull requests

Fill in the template. The reviewer needs to know what you verified, not only what
you wrote. A pull request that says "tested locally" without saying what was run
will be sent back.

Changes to `internal/auth/`, `internal/team/`, `internal/httpapi/`, the workflows,
or the container definition require review from a code owner — see
[`.github/CODEOWNERS`](.github/CODEOWNERS).
