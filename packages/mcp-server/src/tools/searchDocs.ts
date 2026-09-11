export interface SearchDocsArgs {
  query: string;
  source?: string;
  limit?: number;
}

export async function searchDocs(
  args: SearchDocsArgs,
  fetchFn: typeof fetch = fetch,
  baseUrl: string = 'http://127.0.0.1:8080'
) {
  if (!args.query || args.query.trim() === '') {
    throw new Error('Query parameter cannot be empty');
  }

  const url = new URL('/api/docs/search', baseUrl);
  url.searchParams.set('q', args.query.trim());
  if (args.source) url.searchParams.set('source', args.source);
  if (args.limit) url.searchParams.set('limit', String(args.limit));

  const resp = await fetchFn(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(`Toolbox docs search returned error: ${resp.status}`);
  }

  return await resp.json();
}
