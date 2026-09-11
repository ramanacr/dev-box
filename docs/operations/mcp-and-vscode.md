# MCP Server and VS Code Integration Guide

## Overview

Developer Toolbox provides local integrations for AI assistants (via the Model Context Protocol, MCP) and IDEs (via a lightweight VS Code extension).

## 1. Model Context Protocol (MCP) Server

The MCP server connects exclusively to the local Developer Toolbox daemon via HTTP on loopback `http://127.0.0.1:8080`.

### Exposed Tools

- `search_docs({ query: string, source?: string, limit?: number })`: Queries local offline reference documentation and returns matches with score and snippets.
- `transform_data({ input: string, from: 'json'|'yaml', to: 'json'|'yaml' })`: Converts structured payloads locally without leaking data outside the host machine.

### Claude Desktop / IDE MCP Configuration

Add the following to your MCP client configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "developer-toolbox": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "TOOLBOX_URL": "http://127.0.0.1:8080"
      }
    }
  }
}
```

## 2. VS Code Extension

- **Command**: `Developer Toolbox: Search Documentation` (`developerToolbox.searchDocs`).
- Captures selected text in editor, safely encodes it into a URL query parameter, and opens `http://127.0.0.1:8080/docs?q=...` in your default browser.
- Operates 100% locally with zero analytics, telemetry, or remote dependencies.
