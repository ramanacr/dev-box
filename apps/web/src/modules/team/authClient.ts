/**
 * Browser-side OIDC client for team mode.
 *
 * Team mode authenticates with an OIDC provider, but the UI had no way to obtain a
 * token: it called the authenticated endpoints with no Authorization header, so every
 * request was rejected. This implements the authorization-code flow with PKCE, which
 * is the correct grant for a public client that cannot hold a secret.
 *
 * Token handling follows the product's data boundary: the ID token lives in memory
 * for the session and in sessionStorage only so that the page can survive the
 * provider redirect. It is never written to IndexedDB, never placed in a URL beyond
 * the provider's own callback, and is cleared on sign-out and tab close.
 */

export interface TeamIdentity {
  enabled: boolean;
  authenticated: boolean;
  user?: {
    sub: string;
    email: string;
    name: string;
    roles: string[];
  };
}

export interface AuthConfig {
  issuer: string;
  clientId: string;
  /** Scopes requested from the provider. `openid` is mandatory for an ID token. */
  scope?: string;
}

interface DiscoveryDocument {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
}

const STORAGE_TOKEN = 'toolbox/team/id-token';
const STORAGE_VERIFIER = 'toolbox/team/pkce-verifier';
const STORAGE_STATE = 'toolbox/team/oauth-state';
const STORAGE_CONFIG = 'toolbox/team/auth-config';

/** In-memory copy so the common path never touches storage. */
let cachedToken: string | null = null;

function safeSessionStorage(): Storage | null {
  try {
    // Private browsing and hardened configurations can throw on access.
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readStored(key: string): string | null {
  try {
    return safeSessionStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    safeSessionStorage()?.setItem(key, value);
  } catch {
    // A session without storage still works; the token stays in memory only.
  }
}

function clearStored(key: string): void {
  try {
    safeSessionStorage()?.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}

/** Returns the current ID token, or null when the user is not signed in. */
export function getIdToken(): string | null {
  if (cachedToken) return cachedToken;
  cachedToken = readStored(STORAGE_TOKEN);
  return cachedToken;
}

/** Clears all session credentials. */
export function signOut(): void {
  cachedToken = null;
  clearStored(STORAGE_TOKEN);
  clearStored(STORAGE_VERIFIER);
  clearStored(STORAGE_STATE);
}

/**
 * Fetch wrapper that attaches the bearer token to team API calls.
 *
 * A 401 clears the stored token so the UI falls back to the signed-out state rather
 * than looping on a stale credential.
 */
export async function teamFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getIdToken();
  const headers = new Headers(init.headers ?? {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, { ...init, headers });
  if (response.status === 401 && token) {
    signOut();
  }
  return response;
}

/** Reads the team-mode status and identity from the server. */
export async function fetchIdentity(): Promise<TeamIdentity> {
  try {
    const response = await teamFetch('/api/team/me');
    const data = (await response.json()) as Partial<TeamIdentity>;
    return {
      enabled: data.enabled === true,
      authenticated: data.authenticated === true,
      ...(data.user ? { user: data.user } : {}),
    };
  } catch {
    // A network failure is not evidence that team mode is off, but the UI has to
    // render something; treat it as unavailable.
    return { enabled: false, authenticated: false };
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomUrlSafeString(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** Derives the S256 PKCE challenge for a verifier. */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

async function discover(issuer: string): Promise<DiscoveryDocument> {
  const base = issuer.replace(/\/+$/, '');
  const response = await fetch(`${base}/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new Error('The identity provider did not return a discovery document.');
  }
  const doc = (await response.json()) as Partial<DiscoveryDocument>;
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error('The discovery document is missing required endpoints.');
  }
  return doc as DiscoveryDocument;
}

function redirectUri(): string {
  return `${window.location.origin}/team`;
}

/**
 * Starts the sign-in redirect.
 *
 * The verifier and state are kept in sessionStorage because the flow leaves the page
 * entirely; both are single-use and removed as soon as the callback is handled.
 */
export async function signIn(config: AuthConfig): Promise<void> {
  const doc = await discover(config.issuer);

  const verifier = randomUrlSafeString(32);
  const state = randomUrlSafeString(16);
  const challenge = await deriveCodeChallenge(verifier);

  writeStored(STORAGE_VERIFIER, verifier);
  writeStored(STORAGE_STATE, state);
  writeStored(STORAGE_CONFIG, JSON.stringify(config));

  const authorize = new URL(doc.authorization_endpoint);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', config.clientId);
  authorize.searchParams.set('redirect_uri', redirectUri());
  authorize.searchParams.set('scope', config.scope ?? 'openid profile email');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');

  window.location.assign(authorize.toString());
}

export interface CallbackResult {
  handled: boolean;
  error?: string;
}

/**
 * Completes the flow if the current URL carries a provider callback.
 *
 * The state parameter is compared against the stored value before the code is
 * exchanged, which is what prevents an attacker-supplied code from being redeemed in
 * this session. The query string is then removed from the address bar so the code
 * does not linger in history.
 */
export async function handleRedirectCallback(): Promise<CallbackResult> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const returnedState = params.get('state');
  const providerError = params.get('error');

  const stripQuery = () => {
    window.history.replaceState({}, '', window.location.pathname);
  };

  if (providerError) {
    stripQuery();
    signOut();
    return { handled: true, error: `The identity provider reported: ${providerError}` };
  }

  if (!code) {
    return { handled: false };
  }

  const expectedState = readStored(STORAGE_STATE);
  const verifier = readStored(STORAGE_VERIFIER);
  const rawConfig = readStored(STORAGE_CONFIG);

  stripQuery();

  if (!expectedState || returnedState !== expectedState) {
    signOut();
    return { handled: true, error: 'Sign-in state did not match. Please try again.' };
  }
  if (!verifier || !rawConfig) {
    signOut();
    return { handled: true, error: 'Sign-in session expired. Please try again.' };
  }

  let config: AuthConfig;
  try {
    config = JSON.parse(rawConfig) as AuthConfig;
  } catch {
    signOut();
    return { handled: true, error: 'Stored sign-in configuration was unreadable.' };
  }

  try {
    const doc = await discover(config.issuer);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: config.clientId,
      code_verifier: verifier,
    });

    const response = await fetch(doc.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error('Token exchange was rejected.');
    }

    const tokens = (await response.json()) as { id_token?: string };
    if (!tokens.id_token) {
      throw new Error('The provider did not return an ID token.');
    }

    cachedToken = tokens.id_token;
    writeStored(STORAGE_TOKEN, tokens.id_token);

    return { handled: true };
  } catch (error) {
    signOut();
    const message = error instanceof Error ? error.message : 'Sign-in failed.';
    return { handled: true, error: message };
  } finally {
    // Single-use values, regardless of outcome.
    clearStored(STORAGE_VERIFIER);
    clearStored(STORAGE_STATE);
  }
}
