/**
 * MCP tool: search the local Developer Toolbox documentation index.
 *
 * The toolbox service is only ever addressed over loopback. An MCP client runs on the
 * user's machine alongside the container, so a non-local base URL would mean the tool
 * is reaching some other host entirely — that is refused rather than followed.
 */

export interface SearchDocsArgs {
  query: string;
  source?: string;
  limit?: number;
}

export interface SearchDocsResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
  score: number;
}

export const DEFAULT_BASE_URL = 'http://127.0.0.1:8080';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Validates that a base URL points at the local machine.
 *
 * Exported so the server can fail at startup rather than on the first tool call.
 */
export function assertLoopbackBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('Toolbox base URL is not a valid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Toolbox base URL must use http or https.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLoopbackName = LOOPBACK_HOSTNAMES.has(hostname);
  // 127.0.0.0/8 is all loopback, not just 127.0.0.1.
  const isLoopbackV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);

  if (!isLoopbackName && !isLoopbackV4) {
    throw new Error(
      `Refusing to connect to "${hostname}": the MCP bridge only addresses the local toolbox.`,
    );
  }

  return parsed;
}

export interface SearchDocsOptions {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  /** Shared local token, sent only when the server requires one. */
  token?: string;
}

export async function searchDocs(
  args: SearchDocsArgs,
  fetchFnOrOptions: typeof fetch | SearchDocsOptions = {},
  legacyBaseUrl: string = DEFAULT_BASE_URL,
): Promise<SearchDocsResult[]> {
  // Accept both the options object and the original (fetchFn, baseUrl) positional
  // form so existing callers keep working.
  const options: SearchDocsOptions =
    typeof fetchFnOrOptions === 'function'
      ? { fetchFn: fetchFnOrOptions, baseUrl: legacyBaseUrl }
      : fetchFnOrOptions;

  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  const query = args.query?.trim();
  if (!query) {
    throw new Error('Query parameter cannot be empty');
  }
  if (query.length > 200) {
    throw new Error('Query must be 200 characters or fewer');
  }

  if (args.limit !== undefined) {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50) {
      throw new Error('Limit must be an integer between 1 and 50');
    }
  }

  assertLoopbackBaseUrl(baseUrl);

  const url = new URL('/api/docs/search', baseUrl);
  url.searchParams.set('q', query);
  if (args.source) url.searchParams.set('source', args.source);
  if (args.limit) url.searchParams.set('limit', String(args.limit));

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.token) {
    headers['X-Toolbox-Token'] = options.token;
  }

  let resp: Response;
  try {
    resp = await fetchFn(url.toString(), { headers });
  } catch {
    // The error is deliberately generic: a transport failure message can echo the
    // request, and the query text is user content that should not be reflected.
    throw new Error(
      'Could not reach the local Developer Toolbox. Is the container running on loopback?',
    );
  }

  if (!resp.ok) {
    throw new Error(`Toolbox docs search returned error: ${resp.status}`);
  }

  return (await resp.json()) as SearchDocsResult[];
}
