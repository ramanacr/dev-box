# Stage 1: Build Web UI
FROM node:22-alpine AS web-builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
COPY package.json pnpm-workspace.yaml .npmrc* ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile || pnpm install
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

ENV TOOLBOX_BIND_ADDRESS=127.0.0.1 \
    TOOLBOX_PORT=8080 \
    TOOLBOX_DOCS_DB_PATH=/app/packs/core/docs.db \
    TOOLBOX_USER_DOCS_DB_PATH=/app/packs/user/user-docs.db \
    TOOLBOX_WEB_ROOT=/app/web

USER nonroot:nonroot
EXPOSE 8080

ENTRYPOINT ["/toolbox-server"]
