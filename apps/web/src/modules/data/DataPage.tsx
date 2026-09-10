import { useState, useEffect, useRef } from 'preact/hooks';
import { parseInput, serialize, type DataFormat } from './format';
import { convertData } from './convert';
import { inferJsonSchema } from './schema';
import { DataTree } from './DataTree';
import { WorkspaceStore } from '@/platform/storage/workspaceStore';

export function DataPage() {
  const [format, setFormat] = useState<DataFormat>('json');
  const [targetFormat, setTargetFormat] = useState<DataFormat>('yaml');
  const [input, setInput] = useState('{\n  "name": "developer-toolbox",\n  "version": 1,\n  "offline": true,\n  "tags": ["docker", "local-first"]\n}');
  const [output, setOutput] = useState('');
  const [parsedData, setParsedData] = useState<unknown>(null);
  const [activeTab, setActiveTab] = useState<'output' | 'tree' | 'schema'>('output');
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const debounceTimer = useRef<number | null>(null);

  // Restore saved draft
  useEffect(() => {
    WorkspaceStore.get<{ input: string; format: DataFormat }>('data/draft').then((draft) => {
      if (draft && draft.input) {
        setInput(draft.input);
        if (draft.format) setFormat(draft.format);
      }
    });
  }, []);

  // Save draft debounced
  const handleInputChange = (val: string) => {
    setInput(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      WorkspaceStore.set('data/draft', { input: val, format });
    }, 500);
  };

  const handleFormat = () => {
    setError(null);
    const res = parseInput(input, format);
    if (!res.success) {
      setError(res.error || 'Parsing error');
      return;
    }
    setParsedData(res.data);
    try {
      const formatted = serialize(res.data, format);
      setOutput(formatted);
      setActiveTab('output');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Formatting error');
    }
  };

  const handleMinify = () => {
    setError(null);
    const res = parseInput(input, 'json');
    if (!res.success) {
      setError(res.error || 'JSON Parsing error');
      return;
    }
    setParsedData(res.data);
    setOutput(JSON.stringify(res.data));
    setActiveTab('output');
  };

  const handleConvert = () => {
    setError(null);
    const res = convertData(input, format, targetFormat);
    if (!res.success) {
      setError(res.error || 'Conversion error');
      return;
    }
    setOutput(res.output || '');
    setActiveTab('output');
  };

  const handleInferSchema = () => {
    setError(null);
    const res = parseInput(input, format);
    if (!res.success) {
      setError(res.error || 'Cannot parse input to infer schema');
      return;
    }
    setParsedData(res.data);
    const schema = inferJsonSchema(res.data);
    setOutput(JSON.stringify(schema, null, 2));
    setActiveTab('schema');
  };

  const handleInspectTree = () => {
    setError(null);
    const res = parseInput(input, format);
    if (!res.success) {
      setError(res.error || 'Cannot parse input for tree view');
      return;
    }
    setParsedData(res.data);
    setActiveTab('tree');
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleDownload = () => {
    if (!output) return;
    const extensions: Record<DataFormat, string> = {
      json: 'json',
      yaml: 'yaml',
      xml: 'xml',
      csv: 'csv',
    };
    const ext = activeTab === 'schema' ? 'schema.json' : extensions[targetFormat] || 'txt';
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputBytes = new TextEncoder().encode(input).length;

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Structured Data Workbench</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Format, validate, convert, and infer schemas for JSON, YAML, XML, and CSV entirely in your browser.
        </p>
      </div>

      {error && (
        <div role="alert" style={{ padding: '12px 16px', background: 'rgba(248, 113, 113, 0.15)', border: '1px solid var(--danger-color)', borderRadius: 'var(--radius-md)', color: '#fca5a5', marginBottom: '1rem', fontSize: '0.9rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', minHeight: '520px' }}>
        {/* Left Pane: Input */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label htmlFor="input-format-select" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Format:</label>
              <select
                id="input-format-select"
                className="select"
                style={{ width: '100px', padding: '4px 8px' }}
                value={format}
                onChange={(e) => setFormat((e.target as HTMLSelectElement).value as DataFormat)}
              >
                <option value="json">JSON</option>
                <option value="yaml">YAML</option>
                <option value="xml">XML</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {inputBytes.toLocaleString()} bytes
            </span>
          </div>

          <textarea
            className="input code-editor"
            style={{ flex: 1, resize: 'none', minHeight: '380px', marginBottom: '12px' }}
            value={input}
            onInput={(e) => handleInputChange((e.target as HTMLTextAreaElement).value)}
            placeholder="Paste your data here…"
            aria-label="Data input"
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button className="btn btn-primary" onClick={handleFormat}>
              Format
            </button>
            {format === 'json' && (
              <button className="btn" onClick={handleMinify}>
                Minify
              </button>
            )}
            <button className="btn" onClick={handleInspectTree}>
              Tree View
            </button>
            <button className="btn" onClick={handleInferSchema}>
              Infer Schema
            </button>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
              <select
                className="select"
                style={{ width: '90px', padding: '4px 8px' }}
                value={targetFormat}
                onChange={(e) => setTargetFormat((e.target as HTMLSelectElement).value as DataFormat)}
                aria-label="Target conversion format"
              >
                <option value="json">JSON</option>
                <option value="yaml">YAML</option>
                <option value="xml">XML</option>
                <option value="csv">CSV</option>
              </select>
              <button className="btn" onClick={handleConvert}>
                Convert →
              </button>
            </div>
          </div>
        </div>

        {/* Right Pane: Output */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className={`btn ${activeTab === 'output' ? 'btn-primary' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                onClick={() => setActiveTab('output')}
              >
                Output
              </button>
              <button
                className={`btn ${activeTab === 'tree' ? 'btn-primary' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                onClick={handleInspectTree}
              >
                Tree View
              </button>
              <button
                className={`btn ${activeTab === 'schema' ? 'btn-primary' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                onClick={handleInferSchema}
              >
                JSON Schema
              </button>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={handleCopy} disabled={!output && activeTab !== 'tree'}>
                {copyFeedback ? '✓ Copied' : 'Copy'}
              </button>
              <button className="btn" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={handleDownload} disabled={!output}>
                Download
              </button>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'tree' ? (
              parsedData !== null ? (
                <DataTree data={parsedData} />
              ) : (
                <div style={{ color: 'var(--text-muted)', padding: '24px', textAlign: 'center' }}>
                  Click &ldquo;Tree View&rdquo; or &ldquo;Format&rdquo; to visualize the data tree.
                </div>
              )
            ) : (
              <textarea
                className="input code-editor"
                style={{ flex: 1, resize: 'none', minHeight: '380px' }}
                value={output}
                readOnly
                placeholder="Results will appear here…"
                aria-label="Data output"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
