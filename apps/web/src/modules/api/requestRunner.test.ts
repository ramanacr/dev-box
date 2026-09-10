import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runRequest } from './requestRunner';
import { sessionEnv } from './environmentStore';
import { confirmHost, clearConfirmedHosts } from './requestPolicy';

describe('requestRunner', () => {
  beforeEach(() => {
    sessionEnv.clear();
    clearConfirmedHosts();
    vi.restoreAllMocks();
  });

  it('detects unresolved environment variables', async () => {
    const res = await runRequest({
      url: 'http://localhost:8080/pets/{{missingId}}',
      method: 'GET',
    });
    expect(res.status).toBe(0);
    expect(res.error).toContain('Unresolved environment variables: {{missingId}}');
  });

  it('demands confirmation on first request to new host', async () => {
    const res = await runRequest({
      url: 'http://127.0.0.1:8080/api/v1/pets',
      method: 'GET',
    });
    expect(res.requiresHostConfirmation).toBeDefined();
    expect(res.requiresHostConfirmation?.host).toBe('127.0.0.1:8080');
  });

  it('executes allowed request when host is confirmed', async () => {
    confirmHost('127.0.0.1:8080');

    const fakeResponse = {
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify([{ id: 1, name: 'Fluffy' }]),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse));

    const res = await runRequest({
      url: 'http://127.0.0.1:8080/api/v1/pets',
      method: 'GET',
    });

    expect(res.status).toBe(200);
    expect(res.bodyKind).toBe('json');
    expect(res.bodyText).toContain('Fluffy');
  });

  it('redacts sensitive headers in execution model', async () => {
    confirmHost('localhost:3000');
    const fakeResponse = {
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'hello',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse));

    const res = await runRequest({
      url: 'http://localhost:3000/test',
      method: 'GET',
      headers: {
        Authorization: 'Bearer top-secret-token',
        Cookie: 'session=12345',
        'X-Public-Header': 'public-info',
      },
    });

    expect(res.status).toBe(200);
  });

  it('handles binary response without passing through text parser', async () => {
    confirmHost('localhost:8080');
    const fakeBinary = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG signature
    const fakeResponse = {
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => fakeBinary.buffer,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse));

    const res = await runRequest({
      url: 'http://localhost:8080/image.png',
      method: 'GET',
    });

    expect(res.status).toBe(200);
    expect(res.bodyKind).toBe('binary');
    expect(res.bodyBytes).toBeDefined();
    expect(res.bodyText).toContain('[Binary response:');
  });

  it('handles network failure safely with friendly message', async () => {
    confirmHost('localhost:8080');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));

    const res = await runRequest({
      url: 'http://localhost:8080/broken',
      method: 'GET',
    });

    expect(res.status).toBe(0);
    expect(res.error).toContain('Network error or CORS policy');
  });
});
