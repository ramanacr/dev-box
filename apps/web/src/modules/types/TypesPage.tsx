import { useMemo, useState } from 'preact/hooks';
import {
  generateTypes,
  TARGET_LANGUAGES,
  type TargetLanguage,
} from './generateTypes';
import { triggerDownload } from '@/platform/export/download';

const SAMPLE = `{
  "id": 42,
  "name": "Widget",
  "price": 19.99,
  "inStock": true,
  "tags": ["tools", "sale"],
  "description": null,
  "supplier": { "id": 7, "companyName": "Acme Supplies" }
}`;

const FILE_EXTENSIONS: Record<TargetLanguage, string> = {
  typescript: 'ts',
  csharp: 'cs',
  java: 'java',
  kotlin: 'kt',
  go: 'go',
  python: 'py',
  rust: 'rs',
};

export function TypesPage() {
  const [json, setJson] = useState(SAMPLE);
  const [language, setLanguage] = useState<TargetLanguage>('typescript');
  const [rootName, setRootName] = useState('Product');
  const [copied, setCopied] = useState(false);

  const result = useMemo((): { code?: string; error?: string } => {
    try {
      return { code: generateTypes(json, language, { rootName }) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Generation failed' };
    }
  }, [json, language, rootName]);

  const handleCopy = async () => {
    if (!result.code) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    if (!result.code) return;
    const safeName = rootName.replace(/[^A-Za-z0-9_-]/g, '') || 'Model';
    // Generated declarations carry field names and types, never the sample's values,
    // so this output cannot contain a secret from the pasted JSON and does not need
    // the redaction confirmation flow that the text and data exports use.
    triggerDownload(`${safeName}.${FILE_EXTENSIONS[language]}`, result.code);
  };

  return (
    <div className="stack-lg">
      <div>
        <h2>Type Generator</h2>
        <p className="muted">
          Turns a JSON sample into type declarations for TypeScript, C#, Java, Kotlin,
          Go, Python and Rust. Inference runs in your browser; the sample is not
          uploaded.
        </p>
      </div>

      <div className="card">
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Target language</span>
            <select
              className="input"
              value={language}
              onChange={(e) => setLanguage((e.target as HTMLSelectElement).value as TargetLanguage)}
            >
              {TARGET_LANGUAGES.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Root type name</span>
            <input
              type="text"
              className="input"
              value={rootName}
              onInput={(e) => setRootName((e.target as HTMLInputElement).value)}
            />
          </label>
        </div>

        <p className="muted small">
          Types are inferred from the values present in the sample. A field that is
          missing from some array elements becomes optional; a field that is sometimes
          null becomes nullable. Provide a representative sample — inference can only
          describe what it sees.
        </p>
      </div>

      <div className="two-column">
        <div className="card">
          <h3 className="card-title">JSON sample</h3>
          <textarea
            className="input code-input doc-input"
            rows={20}
            spellcheck={false}
            aria-label="JSON sample"
            value={json}
            onInput={(e) => setJson((e.target as HTMLTextAreaElement).value)}
          />
        </div>

        <div className="card">
          <h3 className="card-title">
            Generated types
            <span className="row-gap card-actions">
              <button className="btn" onClick={handleCopy} disabled={!result.code}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button className="btn" onClick={handleDownload} disabled={!result.code}>
                Download
              </button>
            </span>
          </h3>

          {result.error ? (
            <div role="alert" className="alert alert-danger">
              {result.error}
            </div>
          ) : (
            <pre className="code-block">{result.code}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
