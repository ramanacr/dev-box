# Stage 1: Build Web UI
FROM node:22-alpine AS web-builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
# Copy every workspace manifest plus the lockfile before the sources so that
# --frozen-lockfile can be honoured: pnpm validates the lockfile against all
# importers, so a missing package.json would force a fallback resolve and defeat the
# reproducible install.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY apps/web/package.json ./apps/web/
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY packages/vscode/package.json ./packages/vscode/
# Only the web application is needed to produce the runtime image, so install just
# that project's dependencies rather than the whole workspace.
RUN pnpm install --frozen-lockfile --filter @toolbox/web...
COPY apps/web ./apps/web
RUN pnpm --filter @toolbox/web build

# Stage 2: Build Go Server
FROM golang:1.24-alpine AS server-builder
WORKDIR /build
ENV CGO_ENABLED=0 GOOS=linux
COPY go.mod go.sum* ./
RUN go mod download
COPY cmd/ ./cmd/
COPY internal/ ./internal/
RUN go build -ldflags="-s -w" -o /toolbox-server ./cmd/toolbox-server

# Stage 3: Runtime Distroless
FROM gcr.io/distroless/static:nonroot
WORKDIR /app

COPY --from=server-builder /toolbox-server /toolbox-server
COPY --from=web-builder /app/apps/web/dist /app/web
COPY packs/core/docs.db /app/packs/core/docs.db
COPY packs/core/manifest.json /app/packs/core/manifest.json

# Prepare user documentation directory writable by nonroot (uid 65532)
COPY --chown=65532:65532 --from=server-builder /tmp /app/packs/user

# Inside a container, 127.0.0.1 is the container's own loopback, so binding there
# makes published ports unreachable: `docker run -p 18080:8080` would connect to
# nothing. The container binds its own network namespace and the operator controls
# exposure at the host, which is what `compose.yaml` does by publishing to
# 127.0.0.1:8080. The loopback-by-default guarantee therefore lives at the port
# mapping, not at the in-container bind address; the Go default remains 127.0.0.1
# for anyone running the binary directly on a workstation.
ENV TOOLBOX_BIND_ADDRESS=0.0.0.0 \
    TOOLBOX_PORT=8080 \
    TOOLBOX_DOCS_DB_PATH=/app/packs/core/docs.db \
    TOOLBOX_USER_DOCS_DB_PATH=/app/packs/user/user-docs.db \
    TOOLBOX_WEB_ROOT=/app/web

USER nonroot:nonroot
EXPOSE 8080

ENTRYPOINT ["/toolbox-server"]
