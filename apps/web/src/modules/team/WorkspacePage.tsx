import { useState, useEffect } from 'preact/hooks';

export interface WorkspaceItem {
  id: string;
  name: string;
  ownerSubject: string;
  createdAt: string;
}

export function WorkspacePage() {
  const [teamStatus, setTeamStatus] = useState<{ enabled: boolean; authenticated?: boolean; user?: any } | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [newWsName, setNewWsName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/team/me')
      .then((res) => res.json())
      .then((data) => {
        setTeamStatus(data);
        if (data.authenticated) {
          fetchWorkspaces();
        }
      })
      .catch(() => {
        setTeamStatus({ enabled: false });
      });
  }, []);

  const fetchWorkspaces = () => {
    fetch('/api/team/workspaces')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setWorkspaces(data);
      })
      .catch(() => {});
  };

  const handleCreateWorkspace = (e: Event) => {
    e.preventDefault();
    if (!newWsName.trim()) return;

    fetch('/api/team/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newWsName.trim() }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create workspace');
        }
        return res.json();
      })
      .then(() => {
        setNewWsName('');
        setErrorMsg(null);
        fetchWorkspaces();
      })
      .catch((err) => {
        setErrorMsg(err.message);
      });
  };

  if (!teamStatus || !teamStatus.enabled) {
    return (
      <div className="card" style={{ maxWidth: '700px', margin: '40px auto', textAlign: 'center' }}>
        <h2>Localhost Anonymous Mode</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
          Team collaboration mode is optional and currently <strong>disabled</strong> on this instance.
        </p>
        <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
          To activate Team Mode, start the container with <code>TOOLBOX_TEAM_MODE=true</code>, <code>TOOLBOX_OIDC_ISSUER</code>, and an OIDC provider.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2>Shared Workspaces</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Manage asynchronous shared team workspaces with OIDC authentication and role access controls.
        </p>
      </div>

      {errorMsg && (
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--danger-color)', color: '#fff', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
          {errorMsg}
        </div>
      )}

      {/* Create Workspace */}
      <div className="card">
        <h3 style={{ fontSize: '1rem', marginBottom: '10px' }}>Create Shared Workspace</h3>
        <form onSubmit={handleCreateWorkspace} style={{ display: 'flex', gap: '10px', maxWidth: '500px' }}>
          <input
            type="text"
            className="input"
            placeholder="e.g. Backend Services Team"
            value={newWsName}
            onInput={(e) => setNewWsName((e.target as HTMLInputElement).value)}
          />
          <button type="submit" className="btn btn-primary">Create</button>
        </form>
      </div>

      {/* Workspaces List */}
      <div className="card">
        <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Your Shared Workspaces</h3>
        {workspaces.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No shared workspaces joined yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div>
                  <strong>{ws.name}</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {ws.id}</div>
                </div>
                <span className="badge" style={{ fontSize: '0.75rem' }}>Shared</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
