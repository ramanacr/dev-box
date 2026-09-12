import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
import { WorkspacePage } from './WorkspacePage';
import { AdminPage } from './AdminPage';
import { deriveCodeChallenge, getIdToken, signOut } from './authClient';

/** Minimal Response stand-in for fetch mocks. */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Seeds a session token so the page renders its authenticated view. */
function signInWithTestToken() {
  window.sessionStorage.setItem('toolbox/team/id-token', 'test.id.token');
}

describe('WorkspacePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    signOut();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    signOut();
  });

  it('renders the anonymous notice when team mode is off', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ enabled: false }));

    render(<WorkspacePage />);

    await waitFor(() => {
      expect(screen.getByText(/Localhost anonymous mode/i)).toBeDefined();
    });
    expect(screen.queryByText(/Create shared workspace/i)).toBeNull();
  });

  // Regression test: the page previously called the authenticated endpoints with no
  // Authorization header and had no sign-in path at all, so team mode was unusable.
  it('prompts for sign-in when team mode is on but no token is held', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          enabled: true,
          authenticated: false,
          issuer: 'https://id.example.com',
          clientId: 'toolbox-web',
        },
        401,
      ),
    );

    render(<WorkspacePage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sign in with OIDC/i })).toBeDefined();
    });
  });

  it('renders the workspace list when authenticated', async () => {
    signInWithTestToken();

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ enabled: true, authenticated: true, user: { name: 'Alice' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 'ws-1', name: 'Engineering Core', ownerSubject: 'usr_1', createdAt: '2026-09-11' },
        ]),
      );

    render(<WorkspacePage />);

    await waitFor(() => {
      expect(screen.getByText('Shared workspaces')).toBeDefined();
      expect(screen.getByText('Engineering Core')).toBeDefined();
    });

    // Every team call must carry the bearer token.
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get('Authorization')).toBe('Bearer test.id.token');
    }
  });

  it('clears the session token when the server rejects it', async () => {
    signInWithTestToken();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'authentication required' }, 401),
    );

    render(<WorkspacePage />);

    await waitFor(() => {
      expect(getIdToken()).toBeNull();
    });
  });
});

describe('AdminPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    signOut();
    window.sessionStorage.clear();
  });

  it('asks for sign-in when no token is held', async () => {
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText(/Sign in required/i)).toBeDefined();
    });
  });

  it('explains the forbidden state for a non-admin identity', async () => {
    signInWithTestToken();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403));

    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText(/Administrator access required/i)).toBeDefined();
    });
  });

  it('shows pack provenance and requires confirmation before activation', async () => {
    signInWithTestToken();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        {
          name: 'core',
          version: '0.1.0',
          checksum: '1f4081c7d390df7ac69cc43e26bba7a86a95ccd365d74e1e079e69c844393d58',
          license: 'CC-BY-4.0',
          attribution: 'Microsoft Learn',
          activatedBy: 'usr_admin',
        },
      ]),
    );

    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText('core')).toBeDefined();
      expect(screen.getByText('CC-BY-4.0')).toBeDefined();
    });

    // The activation button stays disabled until the provenance fields are supplied.
    const review = screen.getByRole('button', { name: /Review activation/i }) as HTMLButtonElement;
    expect(review.disabled).toBe(true);
  });
});

describe('PKCE challenge derivation', () => {
  // Verified against RFC 7636 Appendix B, which fixes this verifier/challenge pair.
  it('matches the RFC 7636 reference vector', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await deriveCodeChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});
