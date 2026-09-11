import { useState, useEffect, useRef } from 'preact/hooks';
import { bubbleSortSteps, mergeSortSteps } from './sorting';
import { bfsSteps, dijkstraSteps } from './graph';
import { type GraphState, type Step } from './contracts';

const DEFAULT_ARRAY = [45, 12, 85, 32, 89, 39, 69, 22];

const SAMPLE_GRAPH: GraphState = {
  nodes: [
    { id: 'A', x: 80, y: 70 },
    { id: 'B', x: 220, y: 70 },
    { id: 'C', x: 80, y: 190 },
    { id: 'D', x: 220, y: 190 },
    { id: 'E', x: 340, y: 130 },
  ],
  edges: [
    { from: 'A', to: 'B', weight: 4 },
    { from: 'A', to: 'C', weight: 2 },
    { from: 'C', to: 'D', weight: 3 },
    { from: 'B', to: 'D', weight: 1 },
    { from: 'B', to: 'E', weight: 5 },
    { from: 'D', to: 'E', weight: 2 },
  ],
  visitedNodes: [],
};

type AlgorithmType = 'bubbleSort' | 'mergeSort' | 'bfs' | 'dijkstra';

export function AlgorithmPage() {
  const [selectedAlgo, setSelectedAlgo] = useState<AlgorithmType>('bubbleSort');
  const [steps, setSteps] = useState<Step<any>[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(400);

  const timerRef = useRef<any>(null);

  // Initialize steps whenever selected algorithm changes
  useEffect(() => {
    setIsPlaying(false);
    if (timerRef.current) clearInterval(timerRef.current);

    let generatedSteps: Step<any>[] = [];
    if (selectedAlgo === 'bubbleSort') {
      generatedSteps = Array.from(bubbleSortSteps(DEFAULT_ARRAY));
    } else if (selectedAlgo === 'mergeSort') {
      generatedSteps = Array.from(mergeSortSteps(DEFAULT_ARRAY));
    } else if (selectedAlgo === 'bfs') {
      generatedSteps = Array.from(bfsSteps(SAMPLE_GRAPH, 'A'));
    } else if (selectedAlgo === 'dijkstra') {
      generatedSteps = Array.from(dijkstraSteps(SAMPLE_GRAPH, 'A'));
    }

    setSteps(generatedSteps);
    setCurrentStepIdx(0);
  }, [selectedAlgo]);

  // Autoplay control
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentStepIdx((prev) => {
          if (prev < steps.length - 1) {
            return prev + 1;
          }
          setIsPlaying(false);
          return prev;
        });
      }, speedMs);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, steps.length, speedMs]);

  const currentStep = steps[currentStepIdx];
  const isSorting = selectedAlgo === 'bubbleSort' || selectedAlgo === 'mergeSort';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Algorithm Visualizer</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Interactive step-by-step visual inspections of sorting and graph algorithms with accessible state tracking.
          </p>
        </div>

        {/* Algorithm Type Selector */}
        <select
          className="select"
          style={{ width: 'auto' }}
          value={selectedAlgo}
          onChange={(e) => setSelectedAlgo((e.target as HTMLSelectElement).value as AlgorithmType)}
        >
          <option value="bubbleSort">Bubble Sort</option>
          <option value="mergeSort">Merge Sort</option>
          <option value="bfs">Breadth-First Search (BFS)</option>
          <option value="dijkstra">Dijkstra Shortest Path</option>
        </select>
      </div>

      {/* Playback Controls */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button
          className="btn"
          onClick={() => setCurrentStepIdx(0)}
          disabled={currentStepIdx === 0}
          title="Jump to start"
        >
          ⏮ Reset
        </button>
        <button
          className="btn"
          onClick={() => setCurrentStepIdx((p) => Math.max(0, p - 1))}
          disabled={currentStepIdx === 0}
          title="Step back"
        >
          ◀ Step
        </button>
        <button
          className={`btn ${isPlaying ? 'btn-primary' : ''}`}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        <button
          className="btn"
          onClick={() => setCurrentStepIdx((p) => Math.min(steps.length - 1, p + 1))}
          disabled={currentStepIdx >= steps.length - 1}
          title="Step forward"
        >
          Step ▶
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Speed:</span>
          <input
            type="range"
            min="100"
            max="1000"
            step="100"
            value={speedMs}
            onInput={(e) => setSpeedMs(Number((e.target as HTMLInputElement).value))}
          />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', minWidth: '45px' }}>{speedMs}ms</span>
        </div>

        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Step {currentStepIdx + 1} of {steps.length}
        </span>
      </div>

      {/* Step Explanation Banner */}
      {currentStep && (
        <div
          className="card"
          style={{
            borderLeft: '4px solid var(--accent-primary)',
            backgroundColor: 'var(--bg-secondary)',
            fontSize: '0.95rem',
          }}
        >
          <strong>Step Explanation:</strong> {currentStep.explanation}
        </div>
      )}

      {/* Visual Canvas Card */}
      <div className="card" style={{ minHeight: '340px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isSorting && currentStep && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', height: '240px', padding: '16px' }}>
            {(currentStep.state as number[]).map((val, idx) => {
              const isHighlight = currentStep.highlighted.includes(idx);
              const heightPct = (val / 100) * 100;
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{val}</span>
                  <div
                    style={{
                      width: '32px',
                      height: `${heightPct * 1.8}px`,
                      backgroundColor: isHighlight ? 'var(--warning-color)' : 'var(--accent-primary)',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.2s ease, background-color 0.2s ease',
                    }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>[{idx}]</span>
                </div>
              );
            })}
          </div>
        )}

        {!isSorting && currentStep && (
          <svg width="450" height="260" viewBox="0 0 450 260" role="img" aria-label="Graph algorithm visualization">
            {/* Edges */}
            {(currentStep.state as GraphState).edges.map((e, idx) => {
              const fromN = (currentStep.state as GraphState).nodes.find((n) => n.id === e.from);
              const toN = (currentStep.state as GraphState).nodes.find((n) => n.id === e.to);
              if (!fromN || !toN) return null;

              const isCurrent =
                (currentStep.state as GraphState).currentEdge &&
                (currentStep.state as GraphState).currentEdge![0] === e.from &&
                (currentStep.state as GraphState).currentEdge![1] === e.to;

              const midX = (fromN.x + toN.x) / 2;
              const midY = (fromN.y + toN.y) / 2;

              return (
                <g key={idx}>
                  <line
                    x1={fromN.x}
                    y1={fromN.y}
                    x2={toN.x}
                    y2={toN.y}
                    stroke={isCurrent ? 'var(--warning-color)' : 'var(--border-color)'}
                    strokeWidth={isCurrent ? 3 : 1.5}
                  />
                  <rect x={midX - 10} y={midY - 8} width="20" height="16" rx="2" fill="var(--bg-secondary)" />
                  <text x={midX} y={midY + 4} textAnchor="middle" fontSize="10" fill="var(--text-muted)">
                    {e.weight}
                  </text>
                </g>
              );
            })}

            {/* Nodes */}
            {(currentStep.state as GraphState).nodes.map((node) => {
              const isVisited = (currentStep.state as GraphState).visitedNodes.includes(node.id);
              const isHighlight = currentStep.highlighted.includes(node.id);
              const dist = (currentStep.state as GraphState).distances?.[node.id];

              return (
                <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                  <circle
                    r="18"
                    fill={isHighlight ? 'var(--warning-color)' : isVisited ? 'var(--success-color)' : 'var(--bg-tertiary)'}
                    stroke="var(--border-color)"
                    strokeWidth="2"
                  />
                  <text
                    y="5"
                    textAnchor="middle"
                    fill={isHighlight || isVisited ? '#000' : 'var(--text-primary)'}
                    fontSize="12"
                    fontWeight="bold"
                  >
                    {node.id}
                  </text>
                  {dist !== undefined && (
                    <text y="32" textAnchor="middle" fontSize="11" fill="var(--accent-primary)">
                      d={dist === Infinity ? '∞' : dist}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Accessible semantic table view */}
      <details className="card" style={{ fontSize: '0.85rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Semantic Step State Table (Accessibility)</summary>
        <div style={{ marginTop: '12px' }}>
          {isSorting && (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '6px' }}>Index</th>
                  <th style={{ padding: '6px' }}>Value</th>
                  <th style={{ padding: '6px' }}>Active</th>
                </tr>
              </thead>
              <tbody>
                {(currentStep?.state as number[] | undefined)?.map((v, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '6px' }}>{i}</td>
                    <td style={{ padding: '6px' }}>{v}</td>
                    <td style={{ padding: '6px' }}>{currentStep?.highlighted.includes(i) ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isSorting && (
            <p style={{ color: 'var(--text-secondary)' }}>
              Visited nodes: {(currentStep?.state as GraphState)?.visitedNodes?.join(', ') || 'None'}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
