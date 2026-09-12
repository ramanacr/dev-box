import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  computeHmac,
  COMMON_TIMEZONES,
  gzipCompress,
  gzipDecompress,
  HMAC_ALGORITHMS,
  instantFromWallClock,
  isValidTimeZone,
  readInstantAcrossZones,
  supportsGzip,
  type GzipResult,
  type HmacAlgorithm,
  type HmacResult,
  type ZoneReading,
} from './encoding';

type Tab = 'gzip' | 'hmac' | 'timezone';

const TABS: { id: Tab; label: string }[] = [
  { id: 'gzip', label: 'gzip' },
  { id: 'hmac', label: 'HMAC' },
  { id: 'timezone', label: 'Timezones' },
];

export function EncodePage() {
  const [tab, setTab] = useState<Tab>('gzip');

  return (
    <div className="stack-lg">
      <div>
        <h2>Encoding &amp; Time</h2>
        <p className="muted">
          gzip compression, keyed hashes, and timezone conversion. All three use
          browser built-ins — CompressionStream, Web Crypto and Intl — so nothing is
          uploaded and no dependency is involved.
        </p>
      </div>

      <div className="card">
        <div className="tab-row" role="tablist" aria-label="Tool">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'tab tab-active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'gzip' && <GzipPanel />}
      {tab === 'hmac' && <HmacPanel />}
      {tab === 'timezone' && <TimezonePanel />}
    </div>
  );
}

function GzipPanel() {
  const available = supportsGzip();
  const [input, setInput] = useState('The quick brown fox jumps over the lazy dog. '.repeat(8));
  const [compressed, setCompressed] = useState<GzipResult | null>(null);
  const [decoded, setDecoded] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: 'compress' | 'decompress') => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'compress') {
        setCompressed(await gzipCompress(input));
        setDecoded('');
      } else {
        setDecoded(await gzipDecompress(input));
        setCompressed(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed.');
      setCompressed(null);
      setDecoded('');
    } finally {
      setBusy(false);
    }
  };

  if (!available) {
    return (
      <div className="card">
        <div className="alert alert-warning">
          This browser does not provide CompressionStream, so gzip is unavailable here.
          Every other tool is unaffected.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <label className="field">
          <span className="field-label">Input — text to compress, or base64 gzip to decompress</span>
          <textarea
            className="input code-input"
            rows={7}
            spellcheck={false}
            aria-label="gzip input"
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
          />
        </label>
        <div className="row-gap">
          <button className="btn btn-primary" disabled={busy} onClick={() => run('compress')}>
            Compress
          </button>
          <button className="btn" disabled={busy} onClick={() => run('decompress')}>
            Decompress
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="alert alert-danger">
          {error}
        </div>
      )}

      {compressed && (
        <div className="card">
          <h3 className="card-title">Compressed</h3>
          <div className="stat-row">
            <Stat label="Original" value={`${compressed.originalBytes} B`} />
            <Stat label="Compressed" value={`${compressed.compressedBytes} B`} />
            <Stat
              label="Ratio"
              value={`${(compressed.ratio * 100).toFixed(1)}%`}
              danger={compressed.ratio >= 1}
            />
          </div>
          {compressed.note && (
            <div className="alert alert-warning">
              <span className="small">{compressed.note}</span>
            </div>
          )}
          <pre className="code-block">{compressed.base64}</pre>
        </div>
      )}

      {decoded && (
        <div className="card">
          <h3 className="card-title">Decompressed</h3>
          <pre className="code-block">{decoded}</pre>
        </div>
      )}
    </>
  );
}

function HmacPanel() {
  const [message, setMessage] = useState('what do ya want for nothing?');
  const [key, setKey] = useState('');
  const [algorithm, setAlgorithm] = useState<HmacAlgorithm>('SHA-256');
  const [result, setResult] = useState<HmacResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (key === '') {
      setResult(null);
      setError(null);
      return;
    }

    computeHmac(message, key, algorithm)
      .then((r) => {
        if (!cancelled) {
          setResult(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setResult(null);
          setError(e instanceof Error ? e.message : 'Could not compute the HMAC.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [message, key, algorithm]);

  return (
    <>
      <div className="card">
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Algorithm</span>
            <select
              className="input"
              value={algorithm}
              onChange={(e) => setAlgorithm((e.target as HTMLSelectElement).value as HmacAlgorithm)}
            >
              {HMAC_ALGORITHMS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Secret key</span>
            <input
              type="password"
              className="input"
              autocomplete="off"
              placeholder="required"
              aria-label="HMAC secret key"
              value={key}
              onInput={(e) => setKey((e.target as HTMLInputElement).value)}
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">Message</span>
          <textarea
            className="input code-input"
            rows={5}
            spellcheck={false}
            aria-label="Message to authenticate"
            value={message}
            onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
          />
        </label>

        <p className="muted small">
          The key is held in this component only — it is never persisted, logged, or
          sent anywhere. An HMAC without a secret key proves nothing about origin, so
          the key is required rather than defaulted.
        </p>
      </div>

      {key === '' && (
        <div className="alert alert-warning">
          <span className="small">
            Enter a secret key to compute an HMAC. For an unkeyed digest use the
            SHA-256 tool on the Text &amp; Hashes page instead.
          </span>
        </div>
      )}

      {error && (
        <div role="alert" className="alert alert-danger">
          {error}
        </div>
      )}

      {result && (
        <div className="card">
          <h3 className="card-title">HMAC-{result.algorithm}</h3>
          {result.note && (
            <div className="alert alert-warning">
              <span className="small">{result.note}</span>
            </div>
          )}
          <dl className="explain-list">
            <div className="explain-row">
              <dt>
                <span className="role-tag">hex</span>
              </dt>
              <dd>
                <code className="wrap-anywhere">{result.hex}</code>
              </dd>
            </div>
            <div className="explain-row">
              <dt>
                <span className="role-tag">base64</span>
              </dt>
              <dd>
                <code className="wrap-anywhere">{result.base64}</code>
              </dd>
            </div>
          </dl>
        </div>
      )}
    </>
  );
}

function TimezonePanel() {
  const [wallClock, setWallClock] = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [sourceZone, setSourceZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  );
  const [targets, setTargets] = useState<string[]>([
    'UTC',
    'America/New_York',
    'Europe/London',
    'Asia/Kolkata',
    'Asia/Tokyo',
  ]);
  const [candidate, setCandidate] = useState('');

  const state = useMemo((): { instant?: Date; readings?: ZoneReading[]; error?: string } => {
    try {
      const instant = instantFromWallClock(wallClock, sourceZone);
      return { instant, readings: readInstantAcrossZones(instant, targets) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not convert.' };
    }
  }, [wallClock, sourceZone, targets]);

  const addZone = () => {
    const zone = candidate.trim();
    if (zone === '' || targets.includes(zone)) return;
    if (!isValidTimeZone(zone)) return;
    setTargets([...targets, zone]);
    setCandidate('');
  };

  return (
    <>
      <div className="card">
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Wall-clock time</span>
            <input
              type="datetime-local"
              className="input"
              aria-label="Wall-clock date and time"
              value={wallClock}
              onInput={(e) => setWallClock((e.target as HTMLInputElement).value)}
            />
          </label>

          <label className="field">
            <span className="field-label">…as it reads in</span>
            <select
              className="input"
              value={sourceZone}
              onChange={(e) => setSourceZone((e.target as HTMLSelectElement).value)}
            >
              {[sourceZone, ...COMMON_TIMEZONES.filter((z) => z !== sourceZone)].map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="muted small">
          A wall-clock time is not an instant until you say where it was read. 09:00 in
          Tokyo and 09:00 in London are different moments; the table below shows the
          single instant this describes, rendered in each zone.
        </p>

        <div className="row-gap form-inline">
          <input
            type="text"
            className="input"
            placeholder="Add a zone, e.g. Europe/Madrid"
            aria-label="Add a timezone"
            value={candidate}
            onInput={(e) => setCandidate((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addZone();
              }
            }}
          />
          <button
            className="btn"
            onClick={addZone}
            disabled={candidate.trim() === '' || !isValidTimeZone(candidate.trim())}
          >
            Add
          </button>
        </div>
      </div>

      {state.error && (
        <div role="alert" className="alert alert-danger">
          {state.error}
        </div>
      )}

      {state.instant && state.readings && (
        <div className="card">
          <h3 className="card-title">
            One instant, several zones
            <span className="badge mono-xs">{state.instant.toISOString()}</span>
          </h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Zone</th>
                  <th scope="col">Local reading</th>
                  <th scope="col">Offset</th>
                  <th scope="col">Name</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {state.readings.map((reading) => (
                  <tr key={reading.timeZone}>
                    <td className="cell-strong">{reading.timeZone}</td>
                    <td className="mono-xs">{reading.formatted}</td>
                    <td className="mono-xs">{reading.offset}</td>
                    <td>{reading.abbreviation}</td>
                    <td>
                      <button
                        className="chip"
                        aria-label={`Remove ${reading.timeZone}`}
                        onClick={() => setTargets(targets.filter((t) => t !== reading.timeZone))}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Offsets are computed for this date, so daylight saving is already applied.
            The same zone can show a different offset in January and July.
          </p>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="stat">
      <span className="field-label">{label}</span>
      <strong className={danger ? 'cell-danger' : undefined}>{value}</strong>
    </div>
  );
}
