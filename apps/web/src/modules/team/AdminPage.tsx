import { useState, useEffect } from 'preact/hooks';

interface ActivePack {
  name: string;
  version: string;
  checksum: string;
  license: string;
  attribution: string;
  activatedBy: string;
}

export function AdminPage() {
  const [packs, setPacks] = useState<ActivePack[]>([]);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    fetch('/api/team/admin/packs')
      .then((res) => {
        if (res.status === 403) {
          setForbidden(true);
          return [];
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setPacks(data);
      })
      .catch(() => {});
  }, []);

  if (forbidden) {
    return (
      <div className="card" style={{ maxWidth: '600px', margin: '40px auto', textAlign: 'center' }}>
        <h2>403 - Admin Access Required</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
          Your OIDC identity does not have the <code>admin</code> role required to manage organization content packs.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2>Team Administration & Pack Activation</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Inspect active documentation and learning packs with attribution, licensing, and SHA-256 integrity verification.
        </p>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Active Content Packs</h3>
        {packs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No dynamic content packs installed.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                <th style={{ padding: '8px' }}>Pack Name</th>
                <th style={{ padding: '8px' }}>Version</th>
                <th style={{ padding: '8px' }}>License</th>
                <th style={{ padding: '8px' }}>Attribution</th>
                <th style={{ padding: '8px' }}>Activated By</th>
              </tr>
            </thead>
            <tbody>
              {packs.map((p) => (
                <tr key={p.name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '8px', fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: '8px' }}>{p.version}</td>
                  <td style={{ padding: '8px' }}>{p.license}</td>
                  <td style={{ padding: '8px' }}>{p.attribution}</td>
                  <td style={{ padding: '8px' }}>{p.activatedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
