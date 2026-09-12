import { useMemo, useState } from 'preact/hooks';
import { queryJsonPath, SUPPORTED_SYNTAX } from './jsonPath';

const SAMPLE = `{
  "store": {
    "book": [
      { "category": "reference", "author": "Nigel Rees", "title": "Sayings of the Century", "price": 8.95 },
      { "category": "fiction", "author": "Evelyn Waugh", "title": "Sword of Honour", "price": 12.99 },
      { "category": "fiction", "author": "Herman Melville", "title": "Moby Dick", "price": 8.99, "isbn": "0-553-21311-3" }
    ],
    "bicycle": { "color": "red", "price": 19.95 }
  }
}`;

const EXAMPLES = [
  '$.store.book[*].title',
  '$.store.book[?(@.price > 10)].title',
  '$.store.book[?(@.isbn)]',
  '$..price',
  '$.store.book[0:2]',
  "$.store.bicycle['color','price']",
];

export function QueryPage() {
  const [document, setDocument] = useState(SAMPLE);
  const [expression, setExpression] = useState('$.store.book[?(@.price > 10)].title');

  const parsed = useMemo((): { value?: unknown; error?: string } => {
    if (document.trim() === '') return {};
    try {
      return { value: JSON.parse(document) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Invalid JSON' };
    }
  }, [document]);

  const result = useMemo(() => {
    if (parsed.value === undefined) return null;
    try {
      return { ok: true as const, ...queryJsonPath(parsed.value, expression) };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : 'Query failed',
      };
    }
  }, [parsed.value, expression]);

  return (
    <div className="stack-lg">
      <div>
        <h2>JSON Query</h2>
        <p className="muted">
          Run JSONPath expressions against a JSON document. The engine is implemented
          here and parses filter expressions into a typed form — your query text is
          never evaluated as code. Everything runs in your browser.
        </p>
      </div>

      <div className="card">
        <label className="field">
          <span className="field-label">JSONPath expression</span>
          <input
            type="text"
            className="input code-input"
            spellcheck={false}
            aria-label="JSONPath expression"
            value={expression}
            onInput={(e) => setExpression((e.target as HTMLInputElement).value)}
          />
        </label>

        <div className="example-row">
          <span className="field-label">Try:</span>
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="chip" onClick={() => setExpression(example)}>
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="two-column">
        <div className="card">
          <h3 className="card-title">Document</h3>
          <textarea
            className="input code-input doc-input"
            rows={18}
            spellcheck={false}
            aria-label="JSON document to query"
            value={document}
            onInput={(e) => setDocument((e.target as HTMLTextAreaElement).value)}
          />
          {parsed.error && (
            <div role="alert" className="alert alert-danger result-alert">
              JSON parse error: {parsed.error}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">
            Result
            {result?.ok && (
              <span className="badge badge-ok">
                {result.values.length} match{result.values.length === 1 ? '' : 'es'}
              </span>
            )}
          </h3>

          {!result && <p className="muted small">Enter a valid JSON document to query.</p>}

          {result && !result.ok && (
            <div role="alert" className="alert alert-danger">
              {result.message}
            </div>
          )}

          {result?.ok && result.values.length === 0 && (
            <p className="muted small">
              The expression is valid but matched nothing in this document.
            </p>
          )}

          {result?.ok && result.values.length > 0 && (
            <>
              <pre className="code-block">{JSON.stringify(result.values, null, 2)}</pre>
              <details className="paths-details">
                <summary>Matched paths</summary>
                <ul className="plain-list mono-xs">
                  {result.paths.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Supported syntax</h3>
        <p className="muted small">
          This is the complete supported set. Anything not listed is rejected with an
          explanation rather than silently ignored.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Syntax</th>
                <th scope="col">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {SUPPORTED_SYNTAX.map((row) => (
                <tr key={row.syntax}>
                  <td>
                    <code>{row.syntax}</code>
                  </td>
                  <td>{row.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
