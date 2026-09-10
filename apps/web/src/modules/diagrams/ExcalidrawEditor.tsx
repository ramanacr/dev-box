import { useState, useRef, useEffect } from 'preact/hooks';
import { triggerDownload } from '@/platform/export/download';
import { DiagramStore } from './diagramStore';


export interface ExcalidrawEditorProps {
  initialData?: string;
  onSave?: (data: string) => void;
}

interface Point {
  x: number;
  y: number;
}

interface CanvasElement {
  id: string;
  type: 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'freedraw';
  x: number;
  y: number;
  width: number;
  height: number;
  points?: Point[];
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
}

export function ExcalidrawEditor({ initialData, onSave }: ExcalidrawEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<'rectangle' | 'ellipse' | 'arrow' | 'freedraw'>('rectangle');
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<Point>({ x: 0, y: 0 });
  const [strokeColor, setStrokeColor] = useState('#3b82f6');
  const [strokeWidth, setStrokeWidth] = useState(2);

  // Load initial elements if valid .excalidraw JSON
  useEffect(() => {
    if (initialData && DiagramStore.validateExcalidrawJson(initialData)) {
      try {
        const parsed = JSON.parse(initialData);
        if (Array.isArray(parsed.elements)) {
          setElements(parsed.elements);
        }
      } catch {
        // ignore
      }
    }
  }, [initialData]);

  // Redraw canvas whenever elements change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const el of elements) {
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.fillStyle = el.fillColor || 'transparent';

      if (el.type === 'rectangle') {
        ctx.strokeRect(el.x, el.y, el.width, el.height);
      } else if (el.type === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(
          el.x + el.width / 2,
          el.y + el.height / 2,
          Math.abs(el.width / 2),
          Math.abs(el.height / 2),
          0,
          0,
          2 * Math.PI
        );
        ctx.stroke();
      } else if (el.type === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.x + el.width, el.y + el.height);
        ctx.stroke();
      } else if (el.type === 'freedraw' && el.points && el.points.length > 1) {
        const pts = el.points;
        const first = pts[0];
        if (first) {
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < pts.length; i++) {
            const pt = pts[i];
            if (pt) ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
        }
      }
    }
  }, [elements]);


  const handleMouseDown = (e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setStartPos({ x, y });

    const newEl: CanvasElement = {
      id: Math.random().toString(36).slice(2),
      type: tool,
      x,
      y,
      width: 0,
      height: 0,
      points: tool === 'freedraw' ? [{ x, y }] : undefined,
      strokeColor,
      fillColor: 'transparent',
      strokeWidth,
    };
    setElements([...elements, newEl]);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setElements((prev) => {
      const lastIndex = prev.length - 1;
      const last = prev[lastIndex];
      if (!last) return prev;

      const updated: CanvasElement = {
        ...last,
        points: last.type === 'freedraw' ? [...(last.points || []), { x, y }] : last.points,
        width: last.type === 'freedraw' ? last.width : x - startPos.x,
        height: last.type === 'freedraw' ? last.height : y - startPos.y,
      };
      return [...prev.slice(0, lastIndex), updated];
    });
  };


  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleExportJson = () => {
    const excalidrawExport = {
      type: 'excalidraw',
      version: 2,
      source: 'developer-toolbox',
      elements,
      appState: { viewBackgroundColor: '#ffffff' },
    };
    triggerDownload('drawing.excalidraw', JSON.stringify(excalidrawExport, null, 2), 'application/json');
  };


  const handleExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'drawing.png';
    a.click();
  };

  const handleImportJson = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      if (DiagramStore.validateExcalidrawJson(content)) {
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.elements)) {
            setElements(parsed.elements);
          }
        } catch {
          // ignore
        }
      } else {
        alert('Invalid .excalidraw file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
      {/* Canvas Tooling Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className={`btn btn-sm ${tool === 'rectangle' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTool('rectangle')}
          >
            Rectangle
          </button>
          <button
            className={`btn btn-sm ${tool === 'ellipse' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTool('ellipse')}
          >
            Ellipse
          </button>
          <button
            className={`btn btn-sm ${tool === 'arrow' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTool('arrow')}
          >
            Arrow
          </button>
          <button
            className={`btn btn-sm ${tool === 'freedraw' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTool('freedraw')}
          >
            Draw
          </button>

          <span style={{ margin: '0 8px', color: 'var(--border-color)' }}>|</span>

          <input
            type="color"
            value={strokeColor}
            onInput={(e) => setStrokeColor((e.target as HTMLInputElement).value)}
            title="Stroke Color"
            style={{ width: '28px', height: '28px', padding: 0, border: 'none', cursor: 'pointer' }}
          />

          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setElements([])}
            title="Clear canvas"
          >
            Clear
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer' }}>
            Import .excalidraw
            <input type="file" accept=".excalidraw,.json" onChange={handleImportJson} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-sm btn-secondary" onClick={handleExportJson}>
            Export .excalidraw
          </button>
          <button className="btn btn-sm btn-secondary" onClick={handleExportPng}>
            Export PNG
          </button>
          {onSave && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() =>
                onSave(
                  JSON.stringify({
                    type: 'excalidraw',
                    version: 2,
                    elements,
                  })
                )
              }
            >
              Save Sketch
            </button>
          )}
        </div>
      </div>

      {/* Canvas Area */}
      <div
        className="card"
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 0,
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          borderRadius: '4px',
        }}
      >
        <canvas
          ref={canvasRef}
          width={1000}
          height={600}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ width: '1000px', height: '600px', cursor: 'crosshair' }}
        />
      </div>
    </div>
  );
}
