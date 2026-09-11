import { describe, it, expect, vi } from 'vitest';
import { searchDocs } from './searchDocs';
import { transformData } from './transformData';

describe('MCP Tools', () => {
  it('searchDocs builds correct URL and returns JSON payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'doc-1', title: 'React Hooks' }],
    });

    const results = await searchDocs({ query: 'hooks', limit: 5 }, mockFetch as any);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/api/docs/search?q=hooks&limit=5',
      expect.anything()
    );
    expect(results).toEqual([{ id: 'doc-1', title: 'React Hooks' }]);
  });

  it('searchDocs rejects empty query', async () => {
    await expect(searchDocs({ query: '' }, vi.fn() as any)).rejects.toThrow(
      'Query parameter cannot be empty'
    );
  });

  it('transformData converts json formatting', () => {
    const res = transformData({ input: '{"a":1}', from: 'json', to: 'json' });
    expect(res).toBe('{\n  "a": 1\n}');
  });
});
