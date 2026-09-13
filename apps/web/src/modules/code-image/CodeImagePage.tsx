import { useState, useEffect, useRef } from 'preact/hooks';
import { renderCodeImage, type CodeImageOptions } from './renderCodeImage';

export function CodeImagePage() {
  const [code, setCode] = useState(`function calculateFibonacci(n: number): number {
  if (n <= 1) return n;
  return calculateFibonacci(n - 1) + calculateFibonacci(n - 2);
}

// Compute the 10th Fibonacci number
const result = calculateFibonacci(10);
console.log("Fibonacci:", result);`);

  const [theme, setTheme] = useState<CodeImageOptions['theme']>('dark');
  const [background, setBackground] = useState<CodeImageOptions['background']>('gradient-purple');
  const [lineNumbers, setLineNumbers] = useState(true);
  const [padding, setPadding] = useState(32);
  const [svgPreview, setSvgPreview] = useState<string>('');
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renderTimer = useRef<number | null>(null);

  useEffect(() => {
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = window.setTimeout(async () => {
      try {
        setIsRendering(true);
        setError(null);
        const svgBlob = await renderCodeImage({
          code,
          theme,
          background,
          lineNumbers,
          padding,
          format: 'svg',
        });
        const svgText = await svgBlob.text();
        setSvgPreview(svgText);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Render failed');
      } finally {
        setIsRendering(false);
      }
    }, 150);

    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [code, theme, background, lineNumbers, padding]);

  const handleExport = async (format: 'png' | 'svg') => {
    try {
      setError(null);
      const blob = await renderCodeImage({
        code,
        theme,
        background,
        lineNumbers,
        padding,
        format,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `code-snippet.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to export ${format}`);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Code Image Exporter</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Create beautiful code cards with window chrome and export locally as SVG or PNG.
        </p>
      </div>

      {error && (
        <div role="alert" style={{ padding: '12px 16px', background: 'color-mix(in srgb, var(--danger-color) 15%, transparent)', border: '1px solid var(--danger-color)', borderRadius: 'var(--radius-md)', color: '#fca5a5', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '1.5rem' }}>
        {/* Controls Sidebar */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label htmlFor="code-theme-select" style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              Theme
            </label>
            <select
              id="code-theme-select"
              className="select"
              value={theme}
              onChange={(e) => setTheme((e.target as HTMLSelectElement).value as CodeImageOptions['theme'])}
            >
              <option value="dark">Dark</option>
              <option value="dracula">Dracula</option>
              <option value="nord">Nord</option>
              <option value="monokai">Monokai</option>
            </select>
          </div>

          <div>
            <label htmlFor="code-bg-select" style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              Background
            </label>
            <select
              id="code-bg-select"
              className="select"
              value={background}
              onChange={(e) => setBackground((e.target as HTMLSelectElement).value as CodeImageOptions['background'])}
            >
              <option value="gradient-purple">Purple Gradient</option>
              <option value="gradient-blue">Blue Gradient</option>
              <option value="solid-dark">Solid Dark</option>
              <option value="transparent">Transparent</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Line Numbers</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={lineNumbers}
                onChange={(e) => setLineNumbers((e.target as HTMLInputElement).checked)}
              />
              Show
            </label>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label htmlFor="padding-range" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Padding</label>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{padding}px</span>
            </div>
            <input
              id="padding-range"
              type="range"
              min="16"
              max="64"
              step="8"
              value={padding}
              onInput={(e) => setPadding(Number((e.target as HTMLInputElement).value))}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <label htmlFor="code-source-input" style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>Source Code</label>
            <textarea
              id="code-source-input"
              className="input code-editor"
              style={{ flex: 1, minHeight: '180px', resize: 'vertical' }}
              value={code}
              onInput={(e) => setCode((e.target as HTMLTextAreaElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const target = e.target as HTMLTextAreaElement;
                  const start = target.selectionStart;
                  const end = target.selectionEnd;
                  const newCode = code.substring(0, start) + '  ' + code.substring(end);
                  setCode(newCode);
                  setTimeout(() => {
                    target.selectionStart = target.selectionEnd = start + 2;
                  }, 0);
                }
              }}
              placeholder="Paste code snippet…"
              spellcheck={false}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleExport('png')}>
              Export PNG
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={() => handleExport('svg')}>
              Export SVG
            </button>
          </div>
        </div>

        {/* Live SVG Preview */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '450px', overflowX: 'auto', background: 'var(--code-bg)' }}>
          {isRendering && !svgPreview ? (
            <div style={{ color: 'var(--text-muted)' }}>Rendering preview…</div>
          ) : (
            <div
              style={{ maxWidth: '100%', display: 'flex', justifyContent: 'center' }}
              dangerouslySetInnerHTML={{ __html: svgPreview }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
