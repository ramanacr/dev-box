import { useMemo, useState } from 'preact/hooks';
import {
  DIALECTS,
  formatSql,
  lintSql,
  PARAMETER_EXAMPLES,
  type LintFinding,
  type SqlDialect,
} from './sqlFormat';

const SAMPLE = `select * from orders o, customers c
where o.customer_id = c.id and o.status = 'open'
order by o.created_at desc`;

const EXAMPLES: { label: string; sql: string }[] = [
  { label: 'Unbounded DELETE', sql: 'DELETE FROM sessions' },
  { label: '= NULL', sql: "SELECT id FROM users WHERE deleted_at = NULL" },
  { label: 'Concatenation', sql: "SELECT * FROM users WHERE name = 'x' || userInput" },
  { label: 'Comma join', sql: 'SELECT * FROM a, b WHERE a.id = b.a_id' },
  { label: 'CTE', sql: 'with recent as (select id from orders where created_at > $1) select count(*) from recent' },
];

const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 };

export function SqlPage() {
  const [sql, setSql] = useState(SAMPLE);
  const [dialect, setDialect] = useState<SqlDialect>('postgres');
  const [uppercase, setUppercase] = useState(true);
  const [indent, setIndent] = useState(2);

  const formatted = useMemo((): { text?: string; error?: string } => {
    try {
      return { text: formatSql(sql, { uppercaseKeywords: uppercase, indent }) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not format the statement.' };
    }
  }, [sql, uppercase, indent]);

  const findings = useMemo((): { list: LintFinding[]; error?: string } => {
    try {
      const list = [...lintSql(sql, dialect)].sort(
        (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
      );
      return { list };
    } catch (error) {
      return { list: [], error: error instanceof Error ? error.message : 'Could not lint.' };
    }
  }, [sql, dialect]);

  const example = PARAMETER_EXAMPLES[dialect];

  return (
    <div className="stack-lg">
      <div>
        <h2>SQL Assistant</h2>
        <p className="muted">
          Formats a statement and checks it for portability and safety problems against
          your dialect. It does not connect to any database — there is no driver here
          and nothing can be executed. Statements stay in your browser.
        </p>
      </div>

      <div className="card">
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Dialect</span>
            <select
              className="input"
              value={dialect}
              onChange={(e) => setDialect((e.target as HTMLSelectElement).value as SqlDialect)}
            >
              {DIALECTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Indent</span>
            <input
              type="number"
              className="input"
              min={1}
              max={8}
              value={indent}
              onInput={(e) => setIndent(Number((e.target as HTMLInputElement).value) || 2)}
            />
          </label>

          <label className="checkbox align-end">
            <input
              type="checkbox"
              checked={uppercase}
              onChange={(e) => setUppercase((e.target as HTMLInputElement).checked)}
            />
            <span>Uppercase keywords</span>
          </label>
        </div>

        <div className="example-row">
          <span className="field-label">Try:</span>
          {EXAMPLES.map((e) => (
            <button key={e.label} type="button" className="chip" onClick={() => setSql(e.sql)}>
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="two-column">
        <div className="card">
          <h3 className="card-title">Statement</h3>
          <textarea
            className="input code-input doc-input"
            rows={16}
            spellcheck={false}
            aria-label="SQL statement"
            value={sql}
            onInput={(e) => setSql((e.target as HTMLTextAreaElement).value)}
          />
        </div>

        <div className="card">
          <h3 className="card-title">
            Formatted
            <span className="row-gap card-actions">
              <button
                className="btn"
                disabled={!formatted.text}
                onClick={() => formatted.text && setSql(formatted.text)}
              >
                Apply
              </button>
            </span>
          </h3>
          {formatted.error ? (
            <div role="alert" className="alert alert-danger">
              {formatted.error}
            </div>
          ) : (
            <pre className="code-block">{formatted.text}</pre>
          )}
          <p className="muted small">
            Only whitespace and keyword casing change. Every token is preserved, so the
            formatted statement is the same query.
          </p>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">
          Review
          {findings.list.length === 0 ? (
            <span className="badge badge-ok">no findings</span>
          ) : (
            <span className="badge badge-warn">{findings.list.length}</span>
          )}
        </h3>

        {findings.error && (
          <div role="alert" className="alert alert-danger">
            {findings.error}
          </div>
        )}

        {findings.list.length === 0 && !findings.error && (
          <p className="muted small">
            Nothing flagged for {DIALECTS.find((d) => d.id === dialect)?.label}. This is a
            static review of common mistakes, not a guarantee of correctness.
          </p>
        )}

        <div className="stack">
          {findings.list.map((finding, i) => (
            <div
              key={`${finding.rule}-${i}`}
              className={
                finding.severity === 'error'
                  ? 'alert alert-danger'
                  : finding.severity === 'warning'
                    ? 'alert alert-warning'
                    : 'alert'
              }
              role={finding.severity === 'error' ? 'alert' : undefined}
            >
              <div className="finding-head">
                <strong>
                  {finding.severity === 'error' ? '⚠ ' : finding.severity === 'warning' ? '• ' : 'ⓘ '}
                  {finding.rule}
                </strong>
                {finding.line !== undefined && (
                  <span className="muted mono-xs">line {finding.line}</span>
                )}
              </div>
              <div className="small">{finding.message}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Parameterised form for {DIALECTS.find((d) => d.id === dialect)?.label}</h3>
        <p className="muted small">
          Placeholder style: <code>{example.placeholder}</code>. Binding values keeps them
          out of the statement text entirely, which is what makes injection impossible
          rather than merely unlikely.
        </p>
        <pre className="code-block">{example.sql}</pre>
        <pre className="code-block">{example.call}</pre>
      </div>
    </div>
  );
}
