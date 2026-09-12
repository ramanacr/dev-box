# MCP Server and VS Code Integration Guide

## Overview

Developer Toolbox ships two companion integrations: a Model Context Protocol (MCP)
server so an assistant running on your machine can search your offline documentation,
and a VS Code extension that opens your editor selection in the local toolbox.

Neither is part of the container image. Both are deliberately narrow — they read
documentation and convert data, and expose nothing else.

## 1. Model Context Protocol server

### Build

```bash
pnpm install
```

```bash
pnpm --filter @toolbox/mcp-server build
```

This produces `packages/mcp-server/dist/index.js`, an executable stdio MCP server.

### Configure your client

Add the server to your MCP client configuration. For Claude Desktop that is
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "developer-toolbox": {
      "command": "node",
      "args": ["/absolute/path/to/dev-box/packages/mcp-server/dist/index.js"],
      "env": {
        "TOOLBOX_URL": "http://127.0.0.1:8080"
      }
    }
  }
}
```

Use an absolute path: the client launches the process itself and its working
directory is not the repository.

| Variable | Default | Meaning |
| --- | --- | --- |
| `TOOLBOX_URL` | `http://127.0.0.1:8080` | Where the toolbox container is published. Must be a loopback address. |
| `TOOLBOX_LOCAL_TOKEN` | unset | Sent as `X-Toolbox-Token` when the server is configured to require one. |

### Exposed tools

**`search_docs({ query, source?, limit? })`** — full-text search over the offline
documentation packs. `query` is capped at 200 characters and `limit` at 50, matching
the HTTP API's own validation. Results come back as readable text with the title,
source and document id for each match.

**`transform_data({ input, from, to })`** — converts between JSON and YAML entirely
inside the MCP process; nothing is sent anywhere, not even to the container. Input is
capped at 5 MB, the same limit the browser workbench uses. YAML aliases and custom
tags are refused, so a converter cannot be used to expand input.

### Boundaries

These are enforced in code, not merely documented:

- **Loopback only.** A non-loopback `TOOLBOX_URL` fails at startup and is re-checked
  on every call. `127.0.0.0/8`, `localhost` and `::1` are accepted; anything else is
  refused with an explanation. A remote URL would mean the bridge is talking to
  something other than your own container.
- **No API execution and no environment secrets.** The request workbench stays in the
  browser, where its host policy and per-host consent prompts live. There is no MCP
  tool that issues an arbitrary HTTP request.
- **Errors carry no copied user data.** A connection failure reports that the toolbox
  is unreachable; it does not echo the query text back out.

### Troubleshooting

If a tool call reports that the toolbox is unreachable, confirm the container is
running and published on loopback:

```bash
curl -fsS http://127.0.0.1:8080/readyz
```

The server writes diagnostics to stderr, because stdout is the MCP transport. Your
client's MCP log will show the startup line naming the toolbox URL it resolved.

## 2. VS Code extension

### Install for local development

```bash
pnpm --filter @toolbox/vscode build
```

Then either press F5 in VS Code with `packages/vscode` open to launch an Extension
Development Host, or package it with `vsce package` if you want a `.vsix`.

### Usage

| Trigger | Behaviour |
| --- | --- |
| Command palette → **Developer Toolbox: Search Documentation** | Searches the selection, or prompts for a query if nothing is selected |
| Editor context menu (with a selection) | Same command |
| `Ctrl+Alt+D` / `Cmd+Alt+D` | Same command |

The selection is normalised (whitespace collapsed, capped at 200 characters), encoded
into a query parameter, and opened via `vscode.env.openExternal` — so it goes to your
default browser, not an embedded webview.

### Settings

| Setting | Default | Notes |
| --- | --- | --- |
| `developerToolbox.url` | `http://127.0.0.1:8080` | Machine-scoped. Must be a loopback address. |

The setting is `machine`-scoped and validated. A workspace is untrusted input: a
committed `.vscode/settings.json` could otherwise point this at an attacker's host
and have the editor open it with your selected source code in the query string. A
non-loopback value is refused with an error message rather than followed.

### Boundaries

- No webview, so no injected code runs in the editor.
- No telemetry, no analytics, no remote dependency.
- Declares `untrustedWorkspaces.supported`, because it never executes workspace code.

## Verification

```bash
pnpm --filter @toolbox/mcp-server test
```

```bash
pnpm --filter @toolbox/vscode test
```

To confirm the MCP server actually speaks the protocol, drive it over stdio:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1.0"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node packages/mcp-server/dist/index.js
```

You should see an `initialize` result followed by both tools with their JSON schemas.
