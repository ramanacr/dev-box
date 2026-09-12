import { useMemo, useState } from 'preact/hooks';
import { decodeJwt, REGISTERED_CLAIMS, type DecodedJwt } from './decodeJwt';

export function JwtPage() {
  const [token, setToken] = useState('');

  const state = useMemo((): { decoded?: DecodedJwt; error?: string } => {
    if (token.trim() === '') return {};
    try {
      return { decoded: decodeJwt(token) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not decode the token.' };
    }
  }, [token]);

  return (
    <div className="stack-lg">
      <div>
        <h2>JWT Inspector</h2>
        <p className="muted">
          Decodes a JSON Web Token so you can read its header and claims. Decoding is
          not verification and not decryption: the payload of a signed token is
          base64url-encoded, not encrypted, and this tool makes no claim about whether
          the token is authentic. Everything happens in your browser.
        </p>
      </div>

      <div className="card">
        <label className="field">
          <span className="field-label">Token</span>
          <textarea
            className="input code-input"
            rows={5}
            spellcheck={false}
            placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.…"
            aria-label="JWT to decode"
            value={token}
            onInput={(e) => setToken((e.target as HTMLTextAreaElement).value)}
          />
        </label>
        <p className="muted small">
          A token pasted here stays in this tab. It is never sent anywhere, and it is
          not saved.
        </p>
      </div>

      {state.error && (
        <div role="alert" className="alert alert-danger">
          {state.error}
        </div>
      )}

      {state.decoded && <DecodedView decoded={state.decoded} />}
    </div>
  );
}

function DecodedView({ decoded }: { decoded: DecodedJwt }) {
  const blocking = decoded.timing.filter((t) => t.blocking);

  return (
    <>
      <div className="alert alert-warning" role="note">
        <strong>Signature not verified.</strong>{' '}
        <span className="small">
          This tool decodes only. Whether the token is genuine can only be established
          by checking its signature against the issuer&rsquo;s key.
        </span>
      </div>

      {blocking.length > 0 && (
        <div className="alert alert-danger" role="alert">
          <strong>A server following the token&rsquo;s own claims would reject it.</strong>
          <ul className="plain-list small">
            {blocking.map((fact) => (
              <li key={fact.claim}>
                {fact.label}: {fact.relative} ({fact.isoTime})
              </li>
            ))}
          </ul>
        </div>
      )}

      {decoded.timing.length > 0 && (
        <div className="card">
          <h3 className="card-title">Timing</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Claim</th>
                  <th scope="col">Meaning</th>
                  <th scope="col">Instant (UTC)</th>
                  <th scope="col">Relative</th>
                </tr>
              </thead>
              <tbody>
                {decoded.timing.map((fact) => (
                  <tr key={fact.claim}>
                    <td className="cell-strong">
                      <code>{fact.claim}</code>
                    </td>
                    <td>{fact.label}</td>
                    <td className="mono-xs">{fact.isoTime}</td>
                    <td className={fact.blocking ? 'cell-danger' : ''}>{fact.relative}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="two-column">
        <ClaimCard title="Header" data={decoded.header} />
        <ClaimCard title="Payload claims" data={decoded.claims} />
      </div>

      {decoded.notices.length > 1 && (
        <div className="card">
          <h3 className="card-title">Notes</h3>
          <ul className="plain-list small muted">
            {decoded.notices.slice(1).map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3 className="card-title">Signature (encoded, not checked)</h3>
        <pre className="code-block mono-xs">{decoded.segments.signature || '(empty)'}</pre>
      </div>
    </>
  );
}

function ClaimCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  const entries = Object.entries(data);

  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {entries.length === 0 ? (
        <p className="muted small">No entries.</p>
      ) : (
        <dl className="explain-list">
          {entries.map(([key, value]) => (
            <div key={key} className="explain-row">
              <dt>
                <code>{key}</code>
                {REGISTERED_CLAIMS[key] && <span className="role-tag">registered</span>}
              </dt>
              <dd>
                <strong className="part-label">{formatValue(value)}</strong>
                {REGISTERED_CLAIMS[key] && <span>{REGISTERED_CLAIMS[key]}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  return JSON.stringify(value);
}
