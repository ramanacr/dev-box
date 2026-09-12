import { useMemo, useState } from 'preact/hooks';
import { diffText, toUnifiedDiff, type DiffLine, type DiffResult } from './diff';
import { triggerDownload } from '@/platform/export/download';

const SAMPLE_LEFT = `{
  "name": "toolbox",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "vite build",
    "test": "vitest run"
  }
}`;

const SAMPLE_RIGHT = `{
  "name": "toolbox",
  "version": "0.2.0",
  "private": true,
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "e2e": "playwright test"
  }
}`;

export function DiffPage() {
  const [left, setLeft] = useState(SAMPLE_LEFT);
  const [right, setRight] = useState(SAMPLE_RIGHT);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [context, setContext] = useState(3);
  const [showAll, setShowAll] = useState(false);

  const state = useMemo((): { result?: DiffResult; error?: string } => {
    try {
      return { result: diffText(left, right, { ignoreWhitespace, ignoreCase, context }) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not compare the inputs.' };
    }
  }, [left, right, ignoreWhitespace, ignoreCase, context]);

  const result = state.result;

  const handleDownload = () => {
    if (!result) return;
    // The diff reproduces the user's own text, so it goes through the redaction-aware
    // path rather than a raw download.
    triggerDownload('changes.patch', toUnifiedDiff(result, 'left', 'right'), 'text/x-patch');
  };

  const visibleLines: DiffLine[] = result
    ? showAll
      ? result.lines
      : result.hunks.flatMap((h) => h.lines)
    : [];

  return (
    <div className="stack-lg">
      <div>
        <h2>Text Diff</h2>
        <p className="muted">
          Compares two documents with a Myers minimal edit script — the same algorithm
          git uses — so a small change inside a large file shows as a small change.
          Both sides stay in your browser.
        </p>
      </div>

      <div className="card">
        <div className="diff-controls">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={ignoreWhitespace}
              onChange={(e) => setIgnoreWhitespace((e.target as HTMLInputElement).checked)}
            />
            <span>Ignore whitespace</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={ignoreCase}
              onChange={(e) => setIgnoreCase((e.target as HTMLInputElement).checked)}
            />
            <span>Ignore case</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll((e.target as HTMLInputElement).checked)}
            />
            <span>Show unchanged lines</span>
          </label>
          <label className="field inline-field">
            <span className="field-label">Context</span>
            <input
              type="number"
              className="input narrow-input"
              min={0}
              max={20}
              value={context}
              onInput={(e) => setContext(Number((e.target as HTMLInputElement).value) || 0)}
            />
          </label>
        </div>
      </div>

      <div className="two-column">
        <div className="card">
          <h3 className="card-title">Left</h3>
          <textarea
            className="input code-input doc-input"
            rows={14}
            spellcheck={false}
            aria-label="Left document"
            value={left}
            onInput={(e) => setLeft((e.target as HTMLTextAreaElement).value)}
          />
        </div>
        <div className="card">
          <h3 className="card-title">Right</h3>
          <textarea
            className="input code-input doc-input"
            rows={14}
            spellcheck={false}
            aria-label="Right document"
            value={right}
            onInput={(e) => setRight((e.target as HTMLTextAreaElement).value)}
          />
        </div>
      </div>

      {state.error && (
        <div role="alert" className="alert alert-danger">
          {state.error}
        </div>
      )}

      {result && (
        <>
          {result.notes.map((note) => (
            <div key={note} className="alert alert-warning">
              <span className="small">{note}</span>
            </div>
          ))}

          <div className="card">
            <h3 className="card-title">
              Changes
              <span className="diff-stats">
                <span className="stat-added">+{result.stats.added}</span>
                <span className="stat-removed">−{result.stats.removed}</span>
                <span className="muted small">{result.stats.unchanged} unchanged</span>
              </span>
              <span className="row-gap card-actions">
                <button className="btn" onClick={handleDownload} disabled={result.identical}>
                  Download patch
                </button>
              </span>
            </h3>

            {result.identical ? (
              <p className="muted small">The two documents are identical.</p>
            ) : (
              <div className="table-scroll">
                <div className="diff-view" role="table" aria-label="Line differences">
                  {visibleLines.map((line, index) => (
                    <DiffRow key={`${index}-${line.kind}-${line.text}`} line={line} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  const marker = line.kind === 'insert' ? '+' : line.kind === 'delete' ? '−' : ' ';

  return (
    <div className={`diff-row diff-${line.kind}`} role="row">
      <span className="diff-gutter" role="cell">
        {line.leftNumber ?? ''}
      </span>
      <span className="diff-gutter" role="cell">
        {line.rightNumber ?? ''}
      </span>
      <span className="diff-marker" role="cell" aria-label={line.kind}>
        {marker}
      </span>
      <span className="diff-text" role="cell">
        {line.words
          ? line.words.map((word, i) => (
              <span
                key={i}
                className={word.kind === 'equal' ? undefined : `word-${word.kind}`}
              >
                {word.text}
              </span>
            ))
          : line.text || ' '}
      </span>
    </div>
  );
}
