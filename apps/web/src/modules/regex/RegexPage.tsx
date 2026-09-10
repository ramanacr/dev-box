import { useState, useMemo } from 'preact/hooks';
import { evaluateRegex } from './regexEngine';
import { safeDownloadText, type SafeDownloadPrompt } from '@/platform/export/download';

export function RegexPage() {
  const [pattern, setPattern] = useState('(?<user>[a-zA-Z0-9._%+-]+)@(?<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})');
  const [flags, setFlags] = useState('g');
  const [input, setInput] = useState('Contact our team at support@example.com or admin@internal.net.');
  const [replaceWith, setReplaceWith] = useState('[$<user> at $<domain>]');
  const [prompt, setPrompt] = useState<SafeDownloadPrompt | null>(null);

  const evaluation = useMemo(() => {
    return evaluateRegex(pattern, flags, input, replaceWith);
  }, [pattern, flags, input, replaceWith]);

  const toggleFlag = (f: string) => {
    if (flags.includes(f)) {
      setFlags(flags.replace(f, ''));
    } else {
      setFlags(flags + f);
    }
  };

  const handleExport = () => {
    const report = [
      `Pattern: /${pattern}/${flags}`,
      `Total Matches: ${evaluation.matches.length}`,
      `Execution Time: ${evaluation.executionTimeMs.toFixed(2)} ms`,
      '',
      '--- Matches ---',
      ...evaluation.matches.map((m, i) => `[${i + 1}] "${m.match}" at index ${m.index} (length ${m.length})`),
      '',
      '--- Replacement Result ---',
      evaluation.replaceOutput || '',
    ].join('\n');

    safeDownloadText('regex-report.txt', report, (p) => setPrompt(p));
  };

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>ECMAScript Regex Workbench</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Real-time JavaScript regular expression inspection, group extraction, and replacement preview.
        </p>
      </div>

      {prompt && (
        <div role="alertdialog" aria-modal="true" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '500px', width: '90%' }}>
            <h2 style={{ color: 'var(--warning-color)', marginBottom: '8px' }}>⚠️ Sensitive Information Detected</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              The exported file contains potential secrets ({prompt.redaction.detectedTypes.join(', ')}).
              Would you like to export with secrets redacted?
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => { prompt.onCancel(); setPrompt(null); }}>
                Cancel
              </button>
              <button className="btn" style={{ borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }} onClick={() => { prompt.onConfirmOriginal(); setPrompt(null); }}>
                Download Unredacted
              </button>
              <button className="btn btn-primary" onClick={() => { prompt.onConfirmRedacted(); setPrompt(null); }}>
                Download Redacted
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', color: 'var(--text-muted)' }}>/</span>
          <input
            className="input code-editor"
            style={{ flex: 1, fontSize: '1rem' }}
            value={pattern}
            onInput={(e) => setPattern((e.target as HTMLInputElement).value)}
            placeholder="Regular expression pattern…"
            aria-label="Regular expression pattern"
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', color: 'var(--text-muted)' }}>/</span>

          <div style={{ display: 'flex', gap: '4px' }}>
            {['g', 'i', 'm', 's', 'u'].map((flag) => {
              const active = flags.includes(flag);
              return (
                <button
                  key={flag}
                  type="button"
                  onClick={() => toggleFlag(flag)}
                  className={`btn ${active ? 'btn-primary' : ''}`}
                  style={{ padding: '4px 10px', fontSize: '0.85rem' }}
                  title={`Toggle flag /${flag}`}
                  aria-pressed={active}
                >
                  {flag}
                </button>
              );
            })}
          </div>
        </div>

        {!evaluation.isValid && (
          <div role="alert" style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginBottom: '8px' }}>
            {evaluation.error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span>Matches: <strong>{evaluation.matches.length}</strong></span>
          <span>Time: <strong>{evaluation.executionTimeMs.toFixed(2)} ms</strong></span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Test String Input */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '8px' }}>Test String</h2>
          <textarea
            className="input code-editor"
            style={{ flex: 1, minHeight: '280px', resize: 'vertical' }}
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            placeholder="Text to match against…"
            aria-label="Regex test input text"
          />
        </div>

        {/* Matches & Replace Preview */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '1rem' }}>Match Results & Replacement</h2>
            <button className="btn" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={handleExport}>
              Export Report
            </button>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label htmlFor="replace-input" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Replace With:
            </label>
            <input
              id="replace-input"
              className="input code-editor"
              value={replaceWith}
              onInput={(e) => setReplaceWith((e.target as HTMLInputElement).value)}
              placeholder="Replacement string (e.g. $1 or $<group>)…"
            />
          </div>

          {evaluation.replaceOutput !== undefined && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Replacement Output:</div>
              <div className="code-editor" style={{ padding: '8px 12px', background: 'var(--code-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                {evaluation.replaceOutput}
              </div>
            </div>
          )}

          <div style={{ flex: 1, maxHeight: '200px', overflowY: 'auto' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Matched Groups:</div>
            {evaluation.matches.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No matches found.</div>
            ) : (
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {evaluation.matches.map((m, idx) => (
                  <li key={idx} style={{ padding: '6px 10px', background: 'var(--code-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>#{idx + 1}: &ldquo;{m.match}&rdquo;</span>
                      <span style={{ color: 'var(--text-muted)' }}>idx: {m.index}, len: {m.length}</span>
                    </div>
                    {m.groups.length > 0 && (
                      <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Groups: {m.groups.map((g, gi) => `(${gi + 1}: "${g}")`).join(' ')}
                      </div>
                    )}
                    {m.namedGroups && Object.keys(m.namedGroups).length > 0 && (
                      <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Named: {Object.entries(m.namedGroups).map(([k, v]) => `${k}="${v}"`).join(', ')}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
