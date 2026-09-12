import { describe, it, expect, vi } from 'vitest';
import { assertLoopbackBaseUrl, searchDocs } from './searchDocs';
import { transformData } from './transformData';
import { createServer, loadConfig } from '../index';

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe('search_docs', () => {
  it('builds the correct URL and returns the JSON payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okResponse([{ id: 'doc-1', title: 'React Hooks' }]));

    const results = await searchDocs({ query: 'hooks', limit: 5 }, mockFetch as never);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/api/docs/search?q=hooks&limit=5',
      expect.anything(),
    );
    expect(results).toEqual([{ id: 'doc-1', title: 'React Hooks' }]);
  });

  it('passes the source filter through', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okResponse([]));

    await searchDocs({ query: 'rebase', source: 'git' }, { fetchFn: mockFetch as never });

    expect(mockFetch.mock.calls[0]?.[0]).toContain('source=git');
  });

  it('rejects an empty query', async () => {
    await expect(searchDocs({ query: '' }, vi.fn() as never)).rejects.toThrow(
      'Query parameter cannot be empty',
    );
  });

  it('rejects an over-long query', async () => {
    await expect(searchDocs({ query: 'a'.repeat(201) }, vi.fn() as never)).rejects.toThrow(
      /200 characters/,
    );
  });

  it('rejects an out-of-range limit', async () => {
    for (const limit of [0, 51, 2.5]) {
      await expect(searchDocs({ query: 'x', limit }, vi.fn() as never)).rejects.toThrow(
        /between 1 and 50/,
      );
    }
  });

  it('makes no network call when validation fails', async () => {
    const mockFetch = vi.fn();
    await expect(searchDocs({ query: '   ' }, mockFetch as never)).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // The MCP bridge is a local integration. A remote base URL means it is talking to
  // something other than the user's own container, which must be refused.
  it('refuses a non-loopback toolbox URL', async () => {
    const mockFetch = vi.fn();

    await expect(
      searchDocs({ query: 'hooks' }, { fetchFn: mockFetch as never, baseUrl: 'https://evil.example.com' }),
    ).rejects.toThrow(/only addresses the local toolbox/);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('accepts loopback forms', () => {
    for (const url of [
      'http://127.0.0.1:8080',
      'http://localhost:8080',
      'http://127.0.0.5:9000',
      'https://localhost:8443',
    ]) {
      expect(() => assertLoopbackBaseUrl(url)).not.toThrow();
    }
  });

  it('rejects non-http protocols', () => {
    expect(() => assertLoopbackBaseUrl('file:///etc/passwd')).toThrow(/http or https/);
  });

  // A connection failure message must not echo the user's query back out.
  it('reports an unreachable toolbox without copying user data', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:8080'));

    await expect(
      searchDocs({ query: 'my secret internal project name' }, mockFetch as never),
    ).rejects.toThrow(/Could not reach the local Developer Toolbox/);

    await expect(
      searchDocs({ query: 'my secret internal project name' }, mockFetch as never),
    ).rejects.not.toThrow(/secret internal project/);
  });

  it('surfaces a non-2xx status', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 } as unknown as Response);
    await expect(searchDocs({ query: 'x' }, mockFetch as never)).rejects.toThrow(/503/);
  });
});

describe('transform_data', () => {
  it('formats JSON', () => {
    expect(transformData({ input: '{"a":1}', from: 'json', to: 'json' })).toBe('{\n  "a": 1\n}');
  });

  // Regression test: the previous implementation emitted flat "key: value" lines and
  // produced "[object Object]" for anything nested.
  it('converts nested JSON to real YAML', () => {
    const yaml = transformData({
      input: '{"server":{"host":"localhost","ports":[80,443]}}',
      from: 'json',
      to: 'yaml',
    });

    expect(yaml).toContain('server:');
    expect(yaml).toContain('host: localhost');
    expect(yaml).toContain('- 80');
    expect(yaml).not.toContain('[object Object]');
  });

  it('converts YAML back to JSON', () => {
    const json = transformData({
      input: 'server:\n  host: localhost\n  ports:\n    - 80\n    - 443\n',
      from: 'yaml',
      to: 'json',
    });

    expect(JSON.parse(json)).toEqual({ server: { host: 'localhost', ports: [80, 443] } });
  });

  it('round-trips without losing structure', () => {
    const original = { a: { b: [1, 2, { c: true }] }, d: null };
    const yaml = transformData({ input: JSON.stringify(original), from: 'json', to: 'yaml' });
    const back = transformData({ input: yaml, from: 'yaml', to: 'json' });
    expect(JSON.parse(back)).toEqual(original);
  });

  it('rejects empty input', () => {
    expect(() => transformData({ input: '', from: 'json', to: 'json' })).toThrow(
      'Input text cannot be empty',
    );
  });

  it('reports invalid JSON clearly', () => {
    expect(() => transformData({ input: '{not json', from: 'json', to: 'json' })).toThrow(
      /not valid JSON/,
    );
  });

  it('reports invalid YAML clearly', () => {
    expect(() => transformData({ input: 'a:\n  - b\n - c', from: 'yaml', to: 'json' })).toThrow(
      /not valid YAML/,
    );
  });

  it('rejects an unsupported format', () => {
    expect(() =>
      transformData({ input: '{}', from: 'toml' as never, to: 'json' }),
    ).toThrow(/Unsupported "from" format/);
  });

  it('refuses YAML aliases that could expand the input', () => {
    const bomb = 'a: &anchor [1,2]\nb: *anchor\n';
    expect(() => transformData({ input: bomb, from: 'yaml', to: 'json' })).toThrow(/not valid YAML/);
  });
});

describe('server construction', () => {
  it('registers both tools over stdio', () => {
    const server = createServer({ baseUrl: 'http://127.0.0.1:8080' });
    expect(server).toBeDefined();
  });

  it('defaults to the loopback toolbox URL', () => {
    expect(loadConfig({} as NodeJS.ProcessEnv).baseUrl).toBe('http://127.0.0.1:8080');
  });

  it('fails at startup on a remote toolbox URL', () => {
    expect(() => loadConfig({ TOOLBOX_URL: 'http://10.0.0.5:8080' } as NodeJS.ProcessEnv)).toThrow(
      /only addresses the local toolbox/,
    );
  });

  it('carries a configured local token', () => {
    const config = loadConfig({ TOOLBOX_LOCAL_TOKEN: 'abc123' } as NodeJS.ProcessEnv);
    expect(config.token).toBe('abc123');
  });
});
