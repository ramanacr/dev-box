import { useState, useEffect, useRef } from 'preact/hooks';
import mermaid from 'mermaid';
import { triggerDownload } from '@/platform/export/download';


export interface MermaidEditorProps {
  initialSource?: string;
  onSave?: (source: string) => void;
}

const DEFAULT_MERMAID = `sequenceDiagram
    autonumber
    actor Client as Browser Client
    participant App as Developer Toolbox
    participant Target as Local API (127.0.0.1)

    Client->>App: 1. Parse OpenAPI Spec (YAML/JSON)
    App-->>Client: 2. Render Validated Operations
    Client->>App: 3. Send HTTP Request
    App->>Target: 4. Direct Browser Fetch
    Target-->>Client: 5. Inspect Response & Validate Contract
`;

const MAX_DIAGRAM_LENGTH = 200 * 1024; // 200 KB limit

export function MermaidEditor({ initialSource = DEFAULT_MERMAID, onSave }: MermaidEditorProps) {
  const [source, setSource] = useState(initialSource);
  const [svgContent, setSvgContent] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Configure Mermaid with strict security to prevent script injection / XSS
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'default',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      suppressErrorRendering: true,
    });
  }, []);

  useEffect(() => {
    let active = true;

    const renderDiagram = async () => {
      if (!source.trim()) {
        setSvgContent('');
        setRenderError(null);
        return;
      }

      if (source.length > MAX_DIAGRAM_LENGTH) {
        setRenderError('Diagram source exceeds 200 KB limit.');
        return;
      }

      // Proactively check for click/href link navigation syntaxes that might attempt navigation
      if (/\bclick\s+\S+\s+(call|href)/i.test(source)) {
        setRenderError('External navigation actions ("click ... href/call") are forbidden in strict security mode.');
        return;
      }

      try {
        const id = `mermaid-render-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, source);
        if (active) {
          setSvgContent(svg);
          setRenderError(null);
        }
      } catch (err) {
        if (active) {
          setRenderError(err instanceof Error ? err.message : 'Failed to render Mermaid diagram.');
        }
      }
    };

    const timer = setTimeout(renderDiagram, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [source]);

  const handleExportSvg = () => {
    if (!svgContent) return;
    triggerDownload('diagram.svg', svgContent, 'image/svg+xml');
  };


  const handleExportPng = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((pngBlob) => {
        URL.revokeObjectURL(url);
        if (pngBlob) {
          const pngUrl = URL.createObjectURL(pngBlob);
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = 'diagram.png';
          a.click();
          URL.revokeObjectURL(pngUrl);
        }
      }, 'image/png');
    };
    img.src = url;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() =>
              setSource(`flowchart TD\n    A[Start] --> B{Valid?}\n    B -->|Yes| C[Process]\n    B -->|No| D[Reject]\n    C --> E[Done]`)
            }
          >
            Template: Flowchart
          </button>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() =>
              setSource(`sequenceDiagram\n    Alice->>Bob: Hello Bob\n    Bob-->>Alice: Hi Alice`)
            }
          >
            Template: Sequence
          </button>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() =>
              setSource(`classDiagram\n    class Animal {\n      +String name\n      +makeSound()\n    }\n    class Dog {\n      +bark()\n    }\n    Animal <|-- Dog`)
            }
          >
            Template: Class
          </button>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() =>
              setSource(`erDiagram\n    CUSTOMER ||--o{ ORDER : places\n    ORDER ||--|{ LINE-ITEM : contains\n    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`)
            }
          >
            Template: ER
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-sm btn-secondary" onClick={handleExportSvg} disabled={!svgContent}>
            Export SVG
          </button>
          <button className="btn btn-sm btn-secondary" onClick={handleExportPng} disabled={!svgContent}>
            Export PNG
          </button>
          {onSave && (
            <button className="btn btn-sm btn-primary" onClick={() => onSave(source)}>
              Save Diagram
            </button>
          )}
        </div>
      </div>

      {/* Split Editor and Preview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', flex: 1, minHeight: '550px' }}>
        {/* Source Textarea */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '12px' }}>
          <label style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '8px' }}>
            Mermaid Definition (Strict security, ≤ 200 KB)
          </label>
          <textarea
            className="input"
            value={source}
            onInput={(e) => setSource((e.target as HTMLTextAreaElement).value)}
            style={{
              flex: 1,
              width: '100%',
              resize: 'none',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              lineHeight: 1.4,
            }}
            placeholder="graph TD;
  A-->B;"
          />
        </div>

        {/* Live SVG Preview */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '12px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>Live Preview</span>
            {renderError && <span style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>Syntax error</span>}
          </div>

          <div
            ref={containerRef}
            style={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-card-subtle)',
              borderRadius: '4px',
              padding: '16px',
            }}
          >
            {renderError ? (
              <div style={{ color: 'var(--color-error)', fontSize: '0.85rem', whiteSpace: 'pre-wrap', padding: '16px' }}>
                {renderError}
              </div>
            ) : svgContent ? (
              <div
                dangerouslySetInnerHTML={{ __html: svgContent }}
                style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
              />
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Enter diagram definition to view preview</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
