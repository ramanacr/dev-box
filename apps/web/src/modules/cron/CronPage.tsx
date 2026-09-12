import { useMemo, useState } from 'preact/hooks';
import { nextOccurrences, parseCron, SHORTHANDS, type ParsedCron } from './cron';

const EXAMPLES: { expr: string; label: string }[] = [
  { expr: '*/5 * * * *', label: 'Every 5 minutes' },
  { expr: '0 9 * * 1-5', label: 'Weekdays at 09:00' },
  { expr: '0 0 1 * *', label: 'Monthly' },
  { expr: '30 2 * * 0', label: 'Sundays at 02:30' },
  { expr: '0 */4 * * *', label: 'Every 4 hours' },
  { expr: '0 0 13 * 5', label: 'The OR trap' },
  { expr: '@daily', label: '@daily' },
];

const FIELD_LABELS: Record<string, string> = {
  second: 'Second',
  minute: 'Minute',
  hour: 'Hour',
  dayOfMonth: 'Day of month',
  month: 'Month',
  dayOfWeek: 'Day of week',
};

export function CronPage() {
  const [expression, setExpression] = useState('0 9 * * 1-5');

  const state = useMemo((): { parsed?: ParsedCron; error?: string } => {
    try {
      return { parsed: parseCron(expression) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not parse the expression.' };
    }
  }, [expression]);

  const upcoming = useMemo(() => {
    if (!state.parsed) return [];
    try {
      return nextOccurrences(state.parsed, new Date(), 8);
    } catch {
      return [];
    }
  }, [state.parsed]);

  return (
    <div className="stack-lg">
      <div>
        <h2>Cron Visualizer</h2>
        <p className="muted">
          Explains a cron expression field by field and projects when it will actually
          fire. Nothing is scheduled or executed — this reads the expression.
        </p>
      </div>

      <div className="card">
        <label className="field">
          <span className="field-label">Cron expression</span>
          <input
            type="text"
            className="input code-input"
            spellcheck={false}
            aria-label="Cron expression"
            value={expression}
            onInput={(e) => setExpression((e.target as HTMLInputElement).value)}
          />
        </label>

        <div className="example-row">
          <span className="field-label">Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example.expr}
              type="button"
              className="chip"
              title={example.expr}
              onClick={() => setExpression(example.expr)}
            >
              {example.label}
            </button>
          ))}
        </div>

        <p className="muted small field-hint">
          Five fields: minute, hour, day-of-month, month, day-of-week. A leading sixth
          field is read as seconds. Shorthands accepted:{' '}
          {Object.keys(SHORTHANDS).join(', ')}.
        </p>
      </div>

      {state.error && (
        <div role="alert" className="alert alert-danger">
          {state.error}
        </div>
      )}

      {state.parsed && (
        <>
          <div className="card">
            <h3 className="card-title">Meaning</h3>
            <p className="schedule-summary">{state.parsed.description}</p>
            {state.parsed.normalized !== expression.trim().replace(/\s+/g, ' ') && (
              <p className="muted small">
                Expanded to <code>{state.parsed.normalized}</code>
              </p>
            )}
          </div>

          {state.parsed.notes.length > 0 && (
            <div className="stack">
              {state.parsed.notes.map((note) => (
                <div
                  key={note}
                  className={
                    /OR, not AND|1,440 times/.test(note) ? 'alert alert-warning' : 'alert'
                  }
                >
                  <span className="small">{note}</span>
                </div>
              ))}
            </div>
          )}

          <div className="two-column">
            <div className="card">
              <h3 className="card-title">Fields</h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Field</th>
                      <th scope="col">Written</th>
                      <th scope="col">Means</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.parsed.fields.map((f) => (
                      <tr key={f.name}>
                        <td className="cell-strong">{FIELD_LABELS[f.name] ?? f.name}</td>
                        <td>
                          <code>{f.source}</code>
                        </td>
                        <td>
                          {f.description}
                          {!f.wildcard && f.values.length > 1 && f.values.length <= 24 && (
                            <div className="mono-xs muted">{f.values.join(', ')}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3 className="card-title">
                Next runs
                <span className="badge">local time</span>
              </h3>
              {upcoming.length === 0 ? (
                <div className="alert alert-warning">
                  <span className="small">
                    This expression parses but never fires. A date such as 30 February
                    can be written but does not occur.
                  </span>
                </div>
              ) : (
                <ol className="plain-list occurrence-list">
                  {upcoming.map((date) => (
                    <li key={date.toISOString()}>
                      <span className="mono-xs">{date.toLocaleString()}</span>
                      <span className="muted small occurrence-day">
                        {date.toLocaleDateString(undefined, { weekday: 'long' })}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="muted small">
                Projected in this browser&rsquo;s timezone. The server running the job
                may use a different one.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
