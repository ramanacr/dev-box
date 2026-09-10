import { useState } from 'preact/hooks';
import { TextTransforms, type CaseType } from './transforms';
import { safeDownloadText, type SafeDownloadPrompt } from '@/platform/export/download';

export function TextPage() {
  const [input, setInput] = useState('Authorization: Bearer secret-token-example-12345\nhello world\napple\nbanana\napple\ncherry');
  const [output, setOutput] = useState('');
  const [urlSafeBase64, setUrlSafeBase64] = useState(false);
  const [epochInput, setEpochInput] = useState(String(Math.floor(Date.now() / 1000)));
  const [timeResult, setTimeResult] = useState<{ utc: string; local: string; iso: string } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [prompt, setPrompt] = useState<SafeDownloadPrompt | null>(null);

  const applyTransform = async (action: () => string | Promise<string>) => {
    try {
      const res = await action();
      setOutput(res);
    } catch (err) {
      setOutput(`Error: ${err instanceof Error ? err.message : 'Transformation failed'}`);
    }
  };

  const handleTimestampConvert = () => {
    const num = Number(epochInput.trim());
    if (isNaN(num)) {
      setOutput('Invalid timestamp: must be numeric epoch seconds or milliseconds');
      return;
    }
    const res = TextTransforms.formatTimestamp(num);
    setTimeResult(res);
    setOutput(`UTC:   ${res.utc}\nLocal: ${res.local}\nISO:   ${res.iso}`);
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleExport = () => {
    if (!output) return;
    safeDownloadText('transformed-text.txt', output, (p) => setPrompt(p));
  };

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Developer Utilities: Text, Hashes & UUID</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Format conversions, encoding/decoding, Web Crypto hashing, and secret-redacted file export.
        </p>
      </div>

      {prompt && (
        <div role="alertdialog" aria-modal="true" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '500px', width: '90%' }}>
            <h2 style={{ color: 'var(--warning-color)', marginBottom: '8px' }}>⚠️ Sensitive Information Detected</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              The exported content contains potential secrets ({prompt.redaction.detectedTypes.join(', ')}).
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Left: Input and Controls */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '1rem' }}>Input Text</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {new TextEncoder().encode(input).length} bytes
            </span>
          </div>

          <textarea
            className="input code-editor"
            style={{ minHeight: '220px', resize: 'vertical', marginBottom: '16px' }}
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            placeholder="Enter or paste text here…"
            aria-label="Text input"
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Base64 & URL */}
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Encoders / Decoders:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <button className="btn" onClick={() => applyTransform(() => TextTransforms.base64Encode(input, urlSafeBase64))}>
                  Base64 Encode
                </button>
                <button className="btn" onClick={() => applyTransform(() => TextTransforms.base64Decode(input))}>
                  Base64 Decode
                </button>
                <label style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={urlSafeBase64}
                    onChange={(e) => setUrlSafeBase64((e.target as HTMLInputElement).checked)}
                  />
                  URL-Safe
                </label>
                <button className="btn" onClick={() => applyTransform(() => TextTransforms.urlEncode(input))}>
                  URL Encode
                </button>
                <button className="btn" onClick={() => applyTransform(() => TextTransforms.urlDecode(input))}>
                  URL Decode
                </button>
                <button className="btn" onClick={() => applyTransform(() => TextTransforms.htmlEscape(input))}>
                  HTML Escape
                </button>
                <button className="btn" onClick={() => applyTransform(() => TextTransforms.htmlUnescape(input))}>
                  HTML Unescape
                </button>
              </div>
            </div>

            {/* Line Operations */}
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Lines & Deduplication:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <button className="btn" onClick={() => applyTransform(() => TextTransforms.sortLines(input, 'asc'))}>
                  Sort Ascending
                </button>
                <button className="btn" onClick={() => applyTransform(() => TextTransforms.sortLines(input, 'desc'))}>
                  Sort Descending
                </button>
                <button className="btn" onClick={() => applyTransform(() => TextTransforms.sortLines(input, 'length'))}>
                  Sort by Length
                </button>
                <button className="btn" onClick={() => applyTransform(() => TextTransforms.deduplicateLines(input))}>
                  Deduplicate Lines
                </button>
              </div>
            </div>

            {/* Case Conversion */}
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Case Conversion:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(['camel', 'pascal', 'snake', 'kebab', 'upper', 'lower'] as CaseType[]).map((c) => (
                  <button key={c} className="btn" onClick={() => applyTransform(() => TextTransforms.changeCase(input, c))}>
                    {c}Case
                  </button>
                ))}
              </div>
            </div>

            {/* Cryptographic Hashes & UUID */}
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Web Crypto Hashes & UUID:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <button className="btn" onClick={() => applyTransform(() => TextTransforms.sha256(input))}>
                  SHA-256
                </button>
                <button className="btn" onClick={() => applyTransform(() => TextTransforms.sha512(input))}>
                  SHA-512
                </button>
                <button className="btn" onClick={() => applyTransform(() => TextTransforms.generateUUID())}>
                  New UUID v4
                </button>
              </div>
            </div>

            {/* Unix Epoch Time */}
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Unix Timestamp Converter:</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  className="input"
                  style={{ width: '180px' }}
                  value={epochInput}
                  onInput={(e) => setEpochInput((e.target as HTMLInputElement).value)}
                  placeholder="Epoch seconds / ms"
                  aria-label="Unix timestamp"
                />
                <button className="btn" onClick={handleTimestampConvert}>
                  Convert Time
                </button>
                <button className="btn" onClick={() => { const now = String(Math.floor(Date.now() / 1000)); setEpochInput(now); }}>
                  Now
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Output */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '1rem' }}>Result Output</h2>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={handleCopy} disabled={!output}>
                {copyFeedback ? '✓ Copied' : 'Copy'}
              </button>
              <button className="btn" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={handleExport} disabled={!output}>
                Download (Safe)
              </button>
            </div>
          </div>

          <textarea
            className="input code-editor"
            style={{ flex: 1, minHeight: '380px', resize: 'vertical' }}
            value={output}
            readOnly
            placeholder="Transformed output will appear here…"
            aria-label="Transformed text output"
          />
        </div>
      </div>
    </div>
  );
}
