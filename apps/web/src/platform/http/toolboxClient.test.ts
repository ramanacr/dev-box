import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolboxClient, ToolboxApiError } from './toolboxClient';

describe('ToolboxClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('searches docs successfully with query parameters', async () => {
    const mockResults = [
      {
        id: 'test/doc',
        title: 'Test Doc',
        url: 'https://example.com',
        snippet: 'Sample snippet',
        source: 'test',
        score: 1.5,
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    } as Response);

    const results = await ToolboxClient.searchDocs({ text: 'sample', source: 'test', limit: 10 });
    expect(results).toEqual(mockResults);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/docs/search?q=sample&source=test&limit=10',
      expect.objectContaining({
        headers: { Accept: 'application/json' },
      })
    );
  });

  it('transforms 400 Bad Request into ToolboxApiError with server message', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: 'query text exceeds maximum length of 200 characters' }),
    } as Response);

    await expect(ToolboxClient.searchDocs({ text: 'too long' })).rejects.toThrow(
      ToolboxApiError
    );
  });

  it('transforms 404 into ToolboxApiError for missing document', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'document not found' }),
    } as Response);

    await expect(ToolboxClient.getDocument('unknown')).rejects.toThrow('document not found');
  });
});
