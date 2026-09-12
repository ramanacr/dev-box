import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import { bubbleSortSteps, mergeSortSteps } from './sorting';
import { bfsSteps, dfsSteps, dijkstraSteps } from './graph';
import {
  bstInOrderSteps,
  bstInsertSteps,
  bstSearchSteps,
  COLLISION_STRATEGIES,
  hashTableSteps,
  heapExtractSteps,
  heapInsertSteps,
  type BstNode,
  type BstState,
  type CollisionStrategy,
  type HashTableState,
  type HeapState,
} from './structures';
import { type GraphState, type Step } from './contracts';

const DEFAULT_ARRAY = [45, 12, 85, 32, 89, 39, 69, 22];
const TREE_VALUES = [50, 30, 70, 20, 40, 60, 80, 35];
const HEAP_VALUES = [5, 3, 17, 10, 84, 19, 6, 22];
const HASH_VALUES = [1, 8, 15, 3, 22, 10, 29];
const HASH_TABLE_SIZE = 7;

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

type AlgorithmType =
  | 'bubbleSort'
  | 'mergeSort'
  | 'bfs'
  | 'dfs'
  | 'dijkstra'
  | 'heapInsert'
  | 'heapExtract'
  | 'bstInsert'
  | 'bstInOrder'
  | 'bstSearch'
  | 'hashTable';

/** Which renderer a given algorithm's state needs. */
type Visual = 'bars' | 'graph' | 'heap' | 'tree' | 'hash';

interface AlgorithmSpec {
  label: string;
  group: string;
  visual: Visual;
  /** One line on what the visualisation is meant to show. */
  insight: string;
}

const ALGORITHMS: Record<AlgorithmType, AlgorithmSpec> = {
  bubbleSort: {
    label: 'Bubble sort',
    group: 'Sorting',
    visual: 'bars',
    insight: 'Every pass bubbles the largest remaining value to the end. Simple, and quadratic.',
  },
  mergeSort: {
    label: 'Merge sort',
    group: 'Sorting',
    visual: 'bars',
    insight: 'Divides until single elements, then merges sorted runs. O(n log n) regardless of input order.',
  },
  bfs: {
    label: 'Breadth-first search',
    group: 'Graphs',
    visual: 'graph',
    insight: 'A queue explores the nearest nodes first, so it finds the fewest-edges path.',
  },
  dfs: {
    label: 'Depth-first search',
    group: 'Graphs',
    visual: 'graph',
    insight: 'A stack follows one branch to its end before backtracking. Same nodes, very different order.',
  },
  dijkstra: {
    label: 'Dijkstra shortest path',
    group: 'Graphs',
    visual: 'graph',
    insight: 'Always expands the closest unvisited node, so distances are final when settled.',
  },
  heapInsert: {
    label: 'Heap — build by insertion',
    group: 'Heap',
    visual: 'heap',
    insight: 'Each value sifts up until its parent is larger. The root is always the maximum.',
  },
  heapExtract: {
    label: 'Heap — extract max',
    group: 'Heap',
    visual: 'heap',
    insight: 'Removing the root and sifting down repeatedly is the second half of heapsort.',
  },
  bstInsert: {
    label: 'BST — insert',
    group: 'Binary search tree',
    visual: 'tree',
    insight: 'Each comparison sends the value to one subtree. Insertion order decides the shape.',
  },
  bstInOrder: {
    label: 'BST — in-order walk',
    group: 'Binary search tree',
    visual: 'tree',
    insight: 'Left, node, right yields the values sorted without sorting anything.',
  },
  bstSearch: {
    label: 'BST — search',
    group: 'Binary search tree',
    visual: 'tree',
    insight: 'Each comparison discards an entire subtree — the halving that makes lookup logarithmic.',
  },
  hashTable: {
    label: 'Hash table — collisions',
    group: 'Hash table',
    visual: 'hash',
    insight: 'Different keys land in the same bucket. How that is resolved is the whole design question.',
  },
};

const GROUPS = ['Sorting', 'Graphs', 'Heap', 'Binary search tree', 'Hash table'];

export function AlgorithmPage() {
  const [selectedAlgo, setSelectedAlgo] = useState<AlgorithmType>('bubbleSort');
  const [strategy, setStrategy] = useState<CollisionStrategy>('chaining');
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(400);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const spec = ALGORITHMS[selectedAlgo];

  const steps = useMemo((): Step<unknown>[] => {
    switch (selectedAlgo) {
      case 'bubbleSort':
        return Array.from(bubbleSortSteps(DEFAULT_ARRAY));
      case 'mergeSort':
        return Array.from(mergeSortSteps(DEFAULT_ARRAY));
      case 'bfs':
        return Array.from(bfsSteps(SAMPLE_GRAPH, 'A'));
      case 'dfs':
        return Array.from(dfsSteps(SAMPLE_GRAPH, 'A'));
      case 'dijkstra':
        return Array.from(dijkstraSteps(SAMPLE_GRAPH, 'A'));
      case 'heapInsert':
        return Array.from(heapInsertSteps(HEAP_VALUES));
      case 'heapExtract':
        return Array.from(heapExtractSteps(HEAP_VALUES));
      case 'bstInsert':
        return Array.from(bstInsertSteps(TREE_VALUES));
      case 'bstInOrder':
        return Array.from(bstInOrderSteps(TREE_VALUES));
      case 'bstSearch':
        return Array.from(bstSearchSteps(TREE_VALUES, 35));
      case 'hashTable':
        return Array.from(hashTableSteps(HASH_VALUES, HASH_TABLE_SIZE, strategy));
      default:
        return [];
    }
  }, [selectedAlgo, strategy]);

  useEffect(() => {
    setIsPlaying(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setCurrentStepIdx(0);
  }, [selectedAlgo, strategy]);

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentStepIdx((prev) => {
          if (prev < steps.length - 1) return prev + 1;
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

  return (
    <div className="stack-lg">
      <div className="row-between">
        <div>
          <h2>Algorithm Visualizer</h2>
          <p className="muted">
            Step through sorting, graph traversal, heaps, binary search trees and hash
            collisions. Every step is a snapshot, so you can move backwards as freely
            as forwards.
          </p>
        </div>

        <label className="field">
          <span className="field-label">Algorithm</span>
          <select
            className="input"
            aria-label="Algorithm"
            value={selectedAlgo}
            onChange={(e) => setSelectedAlgo((e.target as HTMLSelectElement).value as AlgorithmType)}
          >
            {GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {(Object.entries(ALGORITHMS) as [AlgorithmType, AlgorithmSpec][])
                  .filter(([, s]) => s.group === group)
                  .map(([id, s]) => (
                    <option key={id} value={id}>
                      {s.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      <div className="alert">
        <span className="small">{spec.insight}</span>
      </div>

      {spec.visual === 'hash' && (
        <div className="card">
          <div className="tab-row" role="tablist" aria-label="Collision strategy">
            {COLLISION_STRATEGIES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={strategy === s.id}
                className={strategy === s.id ? 'tab tab-active' : 'tab'}
                onClick={() => setStrategy(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="muted small field-hint">
            {COLLISION_STRATEGIES.find((s) => s.id === strategy)?.summary}
          </p>
        </div>
      )}

      <div className="card playback-controls">
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
          ◀ Back
        </button>
        <button
          className="btn btn-primary"
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={steps.length === 0 || currentStepIdx >= steps.length - 1}
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

        <label className="field inline-field">
          <span className="field-label">Speed</span>
          <input
            type="range"
            min={60}
            max={1200}
            step={20}
            value={1260 - speedMs}
            aria-label="Playback speed"
            onInput={(e) => setSpeedMs(1260 - Number((e.target as HTMLInputElement).value))}
          />
        </label>

        <span className="muted small">
          Step {steps.length === 0 ? 0 : currentStepIdx + 1} of {steps.length}
        </span>
      </div>

      {currentStep && (
        <div className="card step-explanation">
          <strong>Step:</strong> {currentStep.explanation}
        </div>
      )}

      <div className="card visual-canvas">
        {spec.visual === 'bars' && currentStep && (
          <BarsView step={currentStep as Step<number[]>} />
        )}
        {spec.visual === 'graph' && currentStep && (
          <GraphView step={currentStep as Step<GraphState>} />
        )}
        {spec.visual === 'heap' && currentStep && (
          <HeapView step={currentStep as Step<HeapState>} />
        )}
        {spec.visual === 'tree' && currentStep && (
          <TreeView step={currentStep as Step<BstState>} />
        )}
        {spec.visual === 'hash' && currentStep && (
          <HashView step={currentStep as Step<HashTableState>} />
        )}
      </div>

      <details className="card small">
        <summary className="table-summary">Step state as a table (accessible view)</summary>
        <div className="table-scroll detail-body">
          <StateTable visual={spec.visual} step={currentStep} />
        </div>
      </details>
    </div>
  );
}

function BarsView({ step }: { step: Step<number[]> }) {
  const max = Math.max(...step.state, 1);

  return (
    <div className="bars-view">
      {step.state.map((val, idx) => (
        <div key={idx} className="bar-column">
          <span className="bar-value">{val}</span>
          <div
            className={step.highlighted.includes(idx) ? 'bar bar-active' : 'bar'}
            style={{ height: `${(val / max) * 200}px` }}
          />
          <span className="bar-index">[{idx}]</span>
        </div>
      ))}
    </div>
  );
}

function GraphView({ step }: { step: Step<GraphState> }) {
  const graph = step.state;

  return (
    <svg width="450" height="260" viewBox="0 0 450 260" role="img" aria-label="Graph visualization">
      {graph.edges.map((e, idx) => {
        const fromN = graph.nodes.find((n) => n.id === e.from);
        const toN = graph.nodes.find((n) => n.id === e.to);
        if (!fromN || !toN) return null;

        const isCurrent =
          graph.currentEdge && graph.currentEdge[0] === e.from && graph.currentEdge[1] === e.to;
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

      {graph.nodes.map((node) => {
        const isVisited = graph.visitedNodes.includes(node.id);
        const isHighlight = step.highlighted.includes(node.id);
        const dist = graph.distances?.[node.id];

        return (
          <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
            <circle
              r="18"
              fill={
                isHighlight
                  ? 'var(--warning-color)'
                  : isVisited
                    ? 'var(--success-color)'
                    : 'var(--bg-tertiary)'
              }
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
  );
}

/** Renders the array-backed heap as the tree it represents. */
function HeapView({ step }: { step: Step<HeapState> }) {
  const { heap, comparing, extracted } = step.state;

  if (heap.length === 0) {
    return (
      <div className="stack">
        <p className="muted small">The heap is empty.</p>
        {extracted.length > 0 && (
          <p className="small">
            Extracted: <strong>{extracted.join(', ')}</strong>
          </p>
        )}
      </div>
    );
  }

  const levels = Math.ceil(Math.log2(heap.length + 1));
  const width = 520;
  const height = Math.max(160, levels * 70 + 40);

  const position = (index: number) => {
    const level = Math.floor(Math.log2(index + 1));
    const levelStart = 2 ** level - 1;
    const levelCount = 2 ** level;
    const offset = index - levelStart;
    return {
      x: (width / (levelCount + 1)) * (offset + 1),
      y: 34 + level * 70,
    };
  };

  return (
    <div className="stack">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Heap as a tree">
        {heap.map((_, index) => {
          const parent = Math.floor((index - 1) / 2);
          if (index === 0) return null;
          const from = position(parent);
          const to = position(index);
          return (
            <line
              key={`edge-${index}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--border-color)"
              strokeWidth="1.5"
            />
          );
        })}

        {heap.map((value, index) => {
          const { x, y } = position(index);
          const active = comparing.includes(index);
          return (
            <g key={`node-${index}`} transform={`translate(${x}, ${y})`}>
              <circle
                r="18"
                fill={active ? 'var(--warning-color)' : index === 0 ? 'var(--accent-primary)' : 'var(--bg-tertiary)'}
                stroke="var(--border-color)"
                strokeWidth="2"
              />
              <text
                y="5"
                textAnchor="middle"
                fontSize="12"
                fontWeight="bold"
                fill={active || index === 0 ? '#000' : 'var(--text-primary)'}
              >
                {value}
              </text>
              <text y="32" textAnchor="middle" fontSize="9" fill="var(--text-muted)">
                [{index}]
              </text>
            </g>
          );
        })}
      </svg>

      {extracted.length > 0 && (
        <p className="small">
          Extracted so far: <strong>{extracted.join(', ')}</strong>
        </p>
      )}
    </div>
  );
}

/** Lays out a BST by in-order x position and depth y position. */
function TreeView({ step }: { step: Step<BstState> }) {
  const { root, path, traversal } = step.state;

  if (!root) {
    return <p className="muted small">The tree is empty.</p>;
  }

  interface Placed {
    value: number;
    x: number;
    y: number;
    parent?: { x: number; y: number };
  }

  const placed: Placed[] = [];
  let column = 0;

  const layout = (node: BstNode | null, depth: number, parent?: { x: number; y: number }) => {
    if (!node) return;
    layout(node.left, depth + 1, undefined);
    const x = 40 + column * 56;
    const y = 34 + depth * 64;
    column++;
    const entry: Placed = parent ? { value: node.value, x, y, parent } : { value: node.value, x, y };
    placed.push(entry);
    layout(node.right, depth + 1, { x, y });
  };

  // Two passes: the first assigns in-order columns, the second links parents using
  // the positions the first pass produced.
  layout(root, 0);

  const positions = new Map(placed.map((p) => [p.value, { x: p.x, y: p.y }]));
  const edges: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];

  const link = (node: BstNode | null) => {
    if (!node) return;
    const here = positions.get(node.value);
    for (const child of [node.left, node.right]) {
      if (!child || !here) continue;
      const there = positions.get(child.value);
      if (there) edges.push({ from: here, to: there });
      link(child);
    }
  };
  link(root);

  const width = Math.max(360, 40 + column * 56 + 40);
  const height = Math.max(160, Math.max(...placed.map((p) => p.y)) + 50);

  return (
    <div className="stack">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Binary search tree">
        {edges.map((edge, i) => (
          <line
            key={i}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke="var(--border-color)"
            strokeWidth="1.5"
          />
        ))}

        {placed.map((node) => {
          const onPath = path.includes(node.value);
          const emitted = traversal.includes(node.value);
          const isCurrent = step.highlighted.includes(node.value);

          return (
            <g key={node.value} transform={`translate(${node.x}, ${node.y})`}>
              <circle
                r="17"
                fill={
                  isCurrent
                    ? 'var(--warning-color)'
                    : emitted
                      ? 'var(--success-color)'
                      : onPath
                        ? 'var(--accent-primary)'
                        : 'var(--bg-tertiary)'
                }
                stroke="var(--border-color)"
                strokeWidth="2"
              />
              <text
                y="4"
                textAnchor="middle"
                fontSize="11"
                fontWeight="bold"
                fill={isCurrent || emitted || onPath ? '#000' : 'var(--text-primary)'}
              >
                {node.value}
              </text>
            </g>
          );
        })}
      </svg>

      {traversal.length > 0 && (
        <p className="small">
          In-order so far: <strong>{traversal.join(', ')}</strong>
        </p>
      )}
    </div>
  );
}

function HashView({ step }: { step: Step<HashTableState> }) {
  const { buckets, probed, rejected, loadFactor } = step.state;

  return (
    <div className="stack hash-view">
      <div className="stat-row">
        <div className="stat">
          <span className="field-label">Load factor</span>
          <strong className={loadFactor > 0.75 ? 'cell-danger' : undefined}>
            {loadFactor.toFixed(2)}
          </strong>
        </div>
        {rejected.length > 0 && (
          <div className="stat">
            <span className="field-label">Rejected</span>
            <strong className="cell-danger">{rejected.join(', ')}</strong>
          </div>
        )}
      </div>

      <ol className="bucket-list">
        {buckets.map((bucket, index) => {
          const probeOrder = probed.indexOf(index);
          return (
            <li
              key={index}
              className={probeOrder >= 0 ? 'bucket bucket-probed' : 'bucket'}
            >
              <span className="bucket-index">{index}</span>
              <span className="bucket-entries">
                {bucket.length === 0 ? (
                  <span className="muted">empty</span>
                ) : (
                  bucket.map((value, i) => (
                    <span key={i} className="bucket-entry">
                      {value}
                    </span>
                  ))
                )}
              </span>
              {probeOrder >= 0 && (
                <span className="bucket-probe muted mono-xs">probe {probeOrder + 1}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StateTable({ visual, step }: { visual: Visual; step?: Step<unknown> }) {
  if (!step) return <p className="muted small">No step selected.</p>;

  if (visual === 'bars') {
    const values = step.state as number[];
    return (
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Index</th>
            <th scope="col">Value</th>
            <th scope="col">Active</th>
          </tr>
        </thead>
        <tbody>
          {values.map((v, i) => (
            <tr key={i}>
              <td>{i}</td>
              <td>{v}</td>
              <td>{step.highlighted.includes(i) ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (visual === 'graph') {
    const graph = step.state as GraphState;
    return (
      <p className="muted">
        Visited nodes, in order: {graph.visitedNodes.join(' → ') || 'none yet'}.
      </p>
    );
  }

  if (visual === 'heap') {
    const state = step.state as HeapState;
    return (
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Index</th>
            <th scope="col">Value</th>
            <th scope="col">Parent</th>
            <th scope="col">Active</th>
          </tr>
        </thead>
        <tbody>
          {state.heap.map((v, i) => (
            <tr key={i}>
              <td>{i}</td>
              <td>{v}</td>
              <td>{i === 0 ? '—' : state.heap[Math.floor((i - 1) / 2)]}</td>
              <td>{state.comparing.includes(i) ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (visual === 'tree') {
    const state = step.state as BstState;
    return (
      <p className="muted">
        Current path: {state.path.join(' → ') || 'none'}.
        {state.traversal.length > 0 && <> In-order output: {state.traversal.join(', ')}.</>}
      </p>
    );
  }

  const state = step.state as HashTableState;
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th scope="col">Bucket</th>
          <th scope="col">Entries</th>
          <th scope="col">Probed this step</th>
        </tr>
      </thead>
      <tbody>
        {state.buckets.map((bucket, i) => (
          <tr key={i}>
            <td>{i}</td>
            <td>{bucket.length === 0 ? 'empty' : bucket.join(', ')}</td>
            <td>{state.probed.includes(i) ? 'Yes' : 'No'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
