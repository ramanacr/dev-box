import { useEffect, useState } from 'preact/hooks';
import { getIdToken, teamFetch } from './authClient';

interface ActivePack {
  name: string;
  version: string;
  checksum: string;
  license: string;
  attribution: string;
  activatedBy: string;
}

type LoadState = 'loading' | 'ready' | 'forbidden' | 'unauthenticated' | 'error';

const emptyDraft = {
  name: '',
  version: '',
  checksum: '',
  license: '',
  attribution: '',
};

export function AdminPage() {
  const [packs, setPacks] = useState<ActivePack[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadPacks = async () => {
    if (!getIdToken()) {
      setState('unauthenticated');
      return;
    }

    try {
      const response = await teamFetch('/api/team/admin/packs');
      if (response.status === 401) {
        setState('unauthenticated');
        return;
      }
      if (response.status === 403) {
        setState('forbidden');
        return;
      }
      if (!response.ok) {
        setState('error');
        return;
      }
      const data = await response.json();
      if (Array.isArray(data)) setPacks(data);
      setState('ready');
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    void loadPacks();
  }, []);

  const draftComplete =
    draft.name.trim() !== '' &&
    draft.version.trim() !== '' &&
    draft.checksum.trim() !== '' &&
    draft.license.trim() !== '';

  const handleActivate = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await teamFetch('/api/team/admin/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Activation was rejected.');
      }
      setDraft({ ...emptyDraft });
      setConfirming(false);
      await loadPacks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activation failed.');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="card team-notice">
        <p className="muted">Loading administration view…</p>
      </div>
    );
  }

  if (state === 'unauthenticated') {
    return (
      <div className="card team-notice">
        <h2>Sign in required</h2>
        <p className="muted">
          Content pack administration is only available to authenticated team-mode
          administrators. Sign in from the Team page first.
        </p>
      </div>
    );
  }

  if (state === 'forbidden') {
    return (
      <div className="card team-notice">
        <h2>Administrator access required</h2>
        <p className="muted">
          Your identity does not carry the <code>admin</code> role required to manage
          organization content packs.
        </p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="card team-notice">
        <div role="alert" className="alert alert-danger">
          The administration service could not be reached.
        </div>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <div>
        <h2>Team administration &amp; pack activation</h2>
        <p className="muted">
          Inspect active documentation and learning packs with attribution, licensing,
          and SHA-256 integrity provenance.
        </p>
      </div>

      {error && (
        <div role="alert" className="alert alert-danger">
          {error}
        </div>
      )}

      <div className="card">
        <h3 className="card-title">Active content packs</h3>
        {packs.length === 0 ? (
          <p className="muted small">No dynamic content packs activated.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Pack name</th>
                  <th scope="col">Version</th>
                  <th scope="col">License</th>
                  <th scope="col">Attribution</th>
                  <th scope="col">Checksum</th>
                  <th scope="col">Activated by</th>
                </tr>
              </thead>
              <tbody>
                {packs.map((p) => (
                  <tr key={p.name}>
                    <td className="cell-strong">{p.name}</td>
                    <td>{p.version}</td>
                    <td>{p.license}</td>
                    <td>{p.attribution}</td>
                    <td className="mono-xs">{p.checksum.slice(0, 16)}…</td>
                    <td>{p.activatedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">Activate a reviewed pack</h3>
        <p className="muted small">
          A pack cannot be activated without its checksum and license. The
          confirmation step below shows the exact provenance that will be recorded in
          the audit trail.
        </p>

        <div className="field-grid">
          {(
            [
              ['name', 'Pack name', 'core'],
              ['version', 'Version', '0.1.0'],
              ['checksum', 'SHA-256 checksum', '64 lowercase hex characters'],
              ['license', 'Source license', 'CC-BY-4.0'],
              ['attribution', 'Attribution', 'Documentation derived from …'],
            ] as const
          ).map(([key, label, placeholder]) => (
            <label key={key} className="field">
              <span className="field-label">{label}</span>
              <input
                type="text"
                className="input"
                placeholder={placeholder}
                value={draft[key]}
                onInput={(e) =>
                  setDraft({ ...draft, [key]: (e.target as HTMLInputElement).value })
                }
              />
            </label>
          ))}
        </div>

        {!confirming ? (
          <button
            className="btn btn-primary"
            disabled={!draftComplete}
            onClick={() => setConfirming(true)}
          >
            Review activation
          </button>
        ) : (
          <div role="alertdialog" aria-label="Confirm pack activation" className="confirm-panel">
            <h4>Confirm activation</h4>
            <dl className="confirm-list">
              <dt>Pack</dt>
              <dd>
                {draft.name} {draft.version}
              </dd>
              <dt>License</dt>
              <dd>{draft.license}</dd>
              <dt>Attribution</dt>
              <dd>{draft.attribution || '(none provided)'}</dd>
              <dt>Checksum</dt>
              <dd className="mono-xs">{draft.checksum}</dd>
            </dl>
            <p className="muted small">
              Activating records this provenance against your identity in the audit
              trail.
            </p>
            <div className="row-gap">
              <button className="btn btn-primary" onClick={handleActivate} disabled={busy}>
                {busy ? 'Activating…' : 'Activate pack'}
              </button>
              <button className="btn" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
