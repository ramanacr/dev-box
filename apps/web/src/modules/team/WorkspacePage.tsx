import { useEffect, useState } from 'preact/hooks';
import {
  fetchIdentity,
  getIdToken,
  handleRedirectCallback,
  signIn,
  signOut,
  teamFetch,
  type TeamIdentity,
} from './authClient';

export interface WorkspaceItem {
  id: string;
  name: string;
  ownerSubject: string;
  createdAt: string;
}

interface TeamStatus extends TeamIdentity {
  issuer?: string;
  clientId?: string;
}

export function WorkspacePage() {
  const [status, setStatus] = useState<TeamStatus | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [newWsName, setNewWsName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = async () => {
    // /api/team/me returns the OIDC issuer and client id when unauthenticated, which
    // is what the sign-in button needs to start the redirect.
    try {
      const response = await teamFetch('/api/team/me');
      const data = await response.json();
      setStatus({
        enabled: data.enabled === true,
        authenticated: data.authenticated === true,
        user: data.user,
        issuer: data.issuer,
        clientId: data.clientId,
      });
      return data.authenticated === true;
    } catch {
      setStatus(await fetchIdentity());
      return false;
    }
  };

  const loadWorkspaces = async () => {
    try {
      const response = await teamFetch('/api/team/workspaces');
      if (!response.ok) {
        if (response.status === 401) {
          setStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
        }
        return;
      }
      const data = await response.json();
      if (Array.isArray(data)) setWorkspaces(data);
    } catch {
      setErrorMsg('Could not reach the workspace service.');
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Complete the provider redirect first; otherwise the identity call below runs
      // before the token exists and the page flashes the signed-out state.
      const callback = await handleRedirectCallback();
      if (cancelled) return;
      if (callback.error) {
        setErrorMsg(callback.error);
      }

      const authenticated = await loadStatus();
      if (cancelled) return;
      if (authenticated) {
        await loadWorkspaces();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignIn = async () => {
    if (!status?.issuer || !status?.clientId) {
      setErrorMsg('This server has not published an OIDC issuer and client id.');
      return;
    }
    setBusy(true);
    try {
      await signIn({ issuer: status.issuer, clientId: status.clientId });
    } catch (error) {
      setBusy(false);
      setErrorMsg(error instanceof Error ? error.message : 'Sign-in failed.');
    }
  };

  const handleSignOut = () => {
    signOut();
    setWorkspaces([]);
    setStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
  };

  const handleCreateWorkspace = async (e: Event) => {
    e.preventDefault();
    const name = newWsName.trim();
    if (!name) return;

    setBusy(true);
    setErrorMsg(null);
    try {
      const response = await teamFetch('/api/team/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create workspace');
      }
      setNewWsName('');
      await loadWorkspaces();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Failed to create workspace');
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <div className="card team-notice">
        <p className="muted">Checking team mode…</p>
      </div>
    );
  }

  if (!status.enabled) {
    return (
      <div className="card team-notice">
        <h2>Localhost anonymous mode</h2>
        <p className="muted">
          Team collaboration mode is optional and currently <strong>disabled</strong> on this
          instance. Every tool remains fully available; drafts stay in this browser.
        </p>
        <div className="team-hint">
          To activate team mode, start the container with <code>TOOLBOX_TEAM_MODE=true</code>,{' '}
          <code>TOOLBOX_OIDC_ISSUER</code>, and <code>TOOLBOX_OIDC_AUDIENCE</code>. See{' '}
          <code>docs/operations/team-mode.md</code>.
        </div>
      </div>
    );
  }

  if (!status.authenticated || !getIdToken()) {
    return (
      <div className="card team-notice">
        <h2>Sign in to shared workspaces</h2>
        <p className="muted">
          Team mode is enabled on this server. Shared workspaces require an
          authenticated identity from the configured provider.
        </p>
        {errorMsg && (
          <div role="alert" className="alert alert-danger">
            {errorMsg}
          </div>
        )}
        <button className="btn btn-primary" onClick={handleSignIn} disabled={busy}>
          {busy ? 'Redirecting…' : 'Sign in with OIDC'}
        </button>
        <p className="team-hint">
          Your browser-local drafts are never uploaded by signing in. Only workspaces
          you explicitly create or join are shared.
        </p>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <div className="row-between">
        <div>
          <h2>Shared workspaces</h2>
          <p className="muted">
            Asynchronous shared team workspaces with OIDC authentication and role
            access control.
          </p>
        </div>
        <div className="row-gap">
          <span className="badge">{status.user?.name || status.user?.email || 'Signed in'}</span>
          <button className="btn" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="alert alert-danger">
          {errorMsg}
        </div>
      )}

      <div className="card">
        <h3 className="card-title">Create shared workspace</h3>
        <form onSubmit={handleCreateWorkspace} className="row-gap form-inline">
          <input
            type="text"
            className="input"
            placeholder="e.g. Backend Services Team"
            aria-label="Workspace name"
            value={newWsName}
            onInput={(e) => setNewWsName((e.target as HTMLInputElement).value)}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !newWsName.trim()}>
            Create
          </button>
        </form>
      </div>

      <div className="card">
        <h3 className="card-title">Your shared workspaces</h3>
        {workspaces.length === 0 ? (
          <p className="muted small">No shared workspaces joined yet.</p>
        ) : (
          <ul className="workspace-list">
            {workspaces.map((ws) => (
              <li key={ws.id} className="workspace-row">
                <div>
                  <strong>{ws.name}</strong>
                  <div className="mono-xs muted">ID: {ws.id}</div>
                </div>
                <span className="badge">Shared</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
