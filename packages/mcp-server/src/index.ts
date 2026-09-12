#!/usr/bin/env node
/**
 * Developer Toolbox MCP server.
 *
 * Exposes the two tools fixed by the Phase 4 plan — `search_docs` and
 * `transform_data` — over stdio, so an MCP client running on the same machine can
 * query the local documentation index and convert structured data without any of it
 * leaving the host.
 *
 * Deliberate boundaries:
 *   - Only a loopback toolbox URL is accepted, checked at startup and per call.
 *   - API execution and environment secrets are not exposed. The toolbox's request
 *     workbench stays in the browser where its host policy and consent prompts live.
 *   - Tool errors carry no copied user data.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

import { assertLoopbackBaseUrl, DEFAULT_BASE_URL, searchDocs } from './tools/searchDocs.js';
import { transformData } from './tools/transformData.js';

export interface ServerConfig {
  baseUrl: string;
  token?: string;
}

/** Reads configuration from the environment, failing fast on a non-local URL. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const baseUrl = env.TOOLBOX_URL?.trim() || DEFAULT_BASE_URL;
  assertLoopbackBaseUrl(baseUrl);

  const token = env.TOOLBOX_LOCAL_TOKEN?.trim();
  return token ? { baseUrl, token } : { baseUrl };
}

/** Formats a tool failure as MCP error content without echoing user input. */
function toolError(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer({
    name: 'developer-toolbox',
    version: '1.0.0',
  });

  server.registerTool(
    'search_docs',
    {
      title: 'Search local documentation',
      description:
        'Full-text search over the Developer Toolbox offline documentation packs. ' +
        'Runs against the local container only; nothing is sent to a third party.',
      inputSchema: {
        query: z.string().min(1).max(200).describe('Search text, for example "dependency injection"'),
        source: z
          .string()
          .max(64)
          .optional()
          .describe('Restrict results to one source, for example "aspnetcore" or "git"'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum number of results (1-50, default 20)'),
      },
    },
    async ({ query, source, limit }) => {
      try {
        const results = await searchDocs(
          {
            query,
            ...(source !== undefined ? { source } : {}),
            ...(limit !== undefined ? { limit } : {}),
          },
          { baseUrl: config.baseUrl, ...(config.token ? { token: config.token } : {}) },
        );

        if (results.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No matching documentation found.' }] };
        }

        const rendered = results
          .map((r, i) => `${i + 1}. ${r.title} [${r.source}]\n   ${stripMarks(r.snippet)}\n   id: ${r.id}`)
          .join('\n\n');

        return { content: [{ type: 'text' as const, text: rendered }] };
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Documentation search failed.');
      }
    },
  );

  server.registerTool(
    'transform_data',
    {
      title: 'Convert structured data',
      description:
        'Convert between JSON and YAML locally. The input never leaves this process.',
      inputSchema: {
        input: z.string().min(1).describe('The document to convert'),
        from: z.enum(['json', 'yaml']).describe('Input format'),
        to: z.enum(['json', 'yaml']).describe('Output format'),
      },
    },
    async ({ input, from, to }) => {
      try {
        return { content: [{ type: 'text' as const, text: transformData({ input, from, to }) }] };
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Conversion failed.');
      }
    },
  );

  return server;
}

/** Removes the search API's <mark> highlight tags for plain-text output. */
function stripMarks(snippet: string): string {
  return snippet.replace(/<\/?mark>/g, '');
}

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer(config);

  // stdout is the MCP transport, so diagnostics must go to stderr.
  process.stderr.write(`developer-toolbox mcp server ready (toolbox: ${config.baseUrl})\n`);

  await server.connect(new StdioServerTransport());
}

// Only run when executed directly, so the module stays importable by tests.
// pathToFileURL is used rather than string concatenation because a Windows path
// ("D:\...") produces a three-slash file URL that a hand-built "file://" prefix does
// not match, which would silently stop the server from ever starting.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`fatal: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
