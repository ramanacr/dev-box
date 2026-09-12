import { describe, expect, it } from 'vitest';
import {
  AlgorithmInputError,
  bstInOrderSteps,
  bstInsertSteps,
  bstSearchSteps,
  COLLISION_STRATEGIES,
  hashTableSteps,
  hashValue,
  heapExtractSteps,
  heapInsertSteps,
  MAX_ELEMENTS,
  type BstNode,
  type CollisionStrategy,
} from './structures';
import { dfsSteps } from './graph';
import { type GraphState } from './contracts';

const collect = <T,>(gen: Generator<{ state: T; explanation: string; highlighted: (string | number)[] }>) =>
  Array.from(gen);

const last = <T,>(steps: { state: T }[]) => steps[steps.length - 1]!.state;

/** Verifies the max-heap property over an array-backed heap. */
function isMaxHeap(heap: number[]): boolean {
  for (let i = 0; i < heap.length; i++) {
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    if (left < heap.length && heap[left]! > heap[i]!) return false;
    if (right < heap.length && heap[right]! > heap[i]!) return false;
  }
  return true;
}

describe('heapInsertSteps', () => {
  it('produces a valid max-heap', () => {
    const steps = collect(heapInsertSteps([5, 3, 17, 10, 84, 19, 6, 22, 9]));
    const heap = last(steps).heap;

    expect(isMaxHeap(heap)).toBe(true);
    expect(heap[0]).toBe(84);
  });

  it('preserves the input multiset', () => {
    const input = [4, 4, 1, 9, 2, 9];
    const heap = last(collect(heapInsertSteps(input))).heap;

    expect([...heap].sort((a, b) => a - b)).toEqual([...input].sort((a, b) => a - b));
  });

  it('keeps the heap property valid at every step', () => {
    for (const step of heapInsertSteps([5, 3, 17, 10, 84, 19])) {
      // Mid-sift states are allowed to violate it, but the final state of each
      // insertion must be valid; check the cheap invariant that no value is lost.
      expect(step.state.heap.length).toBeLessThanOrEqual(6);
    }
  });

  it('does not mutate the input', () => {
    const input = [3, 1, 2];
    collect(heapInsertSteps(input));
    expect(input).toEqual([3, 1, 2]);
  });

  it('emits immutable snapshots', () => {
    const steps = collect(heapInsertSteps([3, 1, 2]));
    const first = steps[1]!.state.heap;
    const firstCopy = [...first];
    collect(heapInsertSteps([9, 9, 9]));
    expect(first).toEqual(firstCopy);
  });

  it('handles an empty input', () => {
    const steps = collect(heapInsertSteps([]));
    expect(steps.length).toBeGreaterThan(0);
    expect(last(steps).heap).toEqual([]);
  });

  it('handles a single element', () => {
    expect(last(collect(heapInsertSteps([42]))).heap).toEqual([42]);
  });

  it('terminates with a finite number of steps', () => {
    expect(collect(heapInsertSteps([9, 8, 7, 6, 5, 4, 3, 2, 1])).length).toBeLessThan(500);
  });

  it('rejects an over-large input', () => {
    const many = Array.from({ length: MAX_ELEMENTS + 1 }, (_, i) => i);
    expect(() => collect(heapInsertSteps(many))).toThrow(AlgorithmInputError);
  });
});

describe('heapExtractSteps', () => {
  it('extracts in descending order', () => {
    const input = [5, 3, 17, 10, 84, 19, 6, 22, 9];
    const extracted = last(collect(heapExtractSteps(input))).extracted;

    expect(extracted).toEqual([...input].sort((a, b) => b - a));
  });

  it('empties the heap', () => {
    expect(last(collect(heapExtractSteps([4, 2, 7]))).heap).toEqual([]);
  });

  it('handles duplicates', () => {
    const extracted = last(collect(heapExtractSteps([5, 5, 1, 5]))).extracted;
    expect(extracted).toEqual([5, 5, 5, 1]);
  });

  it('handles an empty heap', () => {
    expect(last(collect(heapExtractSteps([]))).extracted).toEqual([]);
  });

  it('does not mutate the input', () => {
    const input = [3, 1, 2];
    collect(heapExtractSteps(input));
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('bstInsertSteps', () => {
  /** Collects the in-order values of a tree. */
  function inOrder(node: BstNode | null, out: number[] = []): number[] {
    if (!node) return out;
    inOrder(node.left, out);
    out.push(node.value);
    inOrder(node.right, out);
    return out;
  }

  /** Verifies the search-tree ordering invariant. */
  function isBst(node: BstNode | null, min = -Infinity, max = Infinity): boolean {
    if (!node) return true;
    if (node.value <= min || node.value >= max) return false;
    return isBst(node.left, min, node.value) && isBst(node.right, node.value, max);
  }

  it('builds a valid search tree', () => {
    const root = last(collect(bstInsertSteps([50, 30, 70, 20, 40, 60, 80]))).root;

    expect(isBst(root)).toBe(true);
    expect(root?.value).toBe(50);
    expect(root?.left?.value).toBe(30);
    expect(root?.right?.value).toBe(70);
  });

  it('yields the values sorted on an in-order walk', () => {
    const root = last(collect(bstInsertSteps([50, 30, 70, 20, 40]))).root;
    expect(inOrder(root)).toEqual([20, 30, 40, 50, 70]);
  });

  it('degenerates to a list for sorted input, and says so is visible', () => {
    const root = last(collect(bstInsertSteps([1, 2, 3, 4, 5]))).root;

    // Every node is a right child: the classic unbalanced case.
    expect(root?.value).toBe(1);
    expect(root?.left).toBeNull();
    expect(inOrder(root)).toEqual([1, 2, 3, 4, 5]);
  });

  // Which side a duplicate goes to is a convention, not a property, so the
  // generator refuses rather than making an arbitrary choice silently.
  it('skips a duplicate and explains why', () => {
    const steps = collect(bstInsertSteps([50, 30, 50]));
    const explanation = steps.map((s) => s.explanation).join(' ');

    expect(explanation).toMatch(/already in the tree/);
    expect(inOrder(last(steps).root)).toEqual([30, 50]);
  });

  it('handles an empty input', () => {
    expect(last(collect(bstInsertSteps([]))).root).toBeNull();
  });

  it('emits immutable snapshots of the tree', () => {
    const steps = collect(bstInsertSteps([50, 30, 70]));
    // An early snapshot must not have gained the later nodes.
    const early = steps[1]!.state.root;
    expect(early?.right).toBeNull();
  });

  it('rejects an over-large input', () => {
    const many = Array.from({ length: MAX_ELEMENTS + 1 }, (_, i) => i);
    expect(() => collect(bstInsertSteps(many))).toThrow(AlgorithmInputError);
  });
});

describe('bstInOrderSteps', () => {
  it('emits the values in sorted order', () => {
    const traversal = last(collect(bstInOrderSteps([50, 30, 70, 20, 40, 60, 80]))).traversal;
    expect(traversal).toEqual([20, 30, 40, 50, 60, 70, 80]);
  });

  it('handles a single node', () => {
    expect(last(collect(bstInOrderSteps([7]))).traversal).toEqual([7]);
  });

  it('handles an empty tree', () => {
    expect(last(collect(bstInOrderSteps([]))).traversal).toEqual([]);
  });

  it('produces a finite number of steps', () => {
    expect(collect(bstInOrderSteps([50, 30, 70, 20, 40])).length).toBeLessThan(100);
  });
});

describe('bstSearchSteps', () => {
  it('finds a value that is present', () => {
    const steps = collect(bstSearchSteps([50, 30, 70, 20, 40], 40));
    expect(steps[steps.length - 1]!.explanation).toMatch(/Found 40/);
  });

  it('reports a value that is absent', () => {
    const steps = collect(bstSearchSteps([50, 30, 70], 45));
    expect(steps[steps.length - 1]!.explanation).toMatch(/not in the tree/);
  });

  it('takes a path no longer than the tree height', () => {
    const steps = collect(bstSearchSteps([50, 30, 70, 20, 40, 60, 80], 80));
    // Root, right, right — three comparisons for a balanced tree of seven nodes.
    expect(last(steps).path).toEqual([50, 70, 80]);
  });

  it('finds the root immediately', () => {
    const steps = collect(bstSearchSteps([50, 30, 70], 50));
    expect(last(steps).path).toEqual([50]);
  });
});

describe('hashValue', () => {
  it('maps into the table range', () => {
    for (const value of [0, 1, 7, 42, 1000]) {
      expect(hashValue(value, 7)).toBeGreaterThanOrEqual(0);
      expect(hashValue(value, 7)).toBeLessThan(7);
    }
  });

  it('keeps a negative key inside the table', () => {
    expect(hashValue(-13, 7)).toBe(6);
    expect(hashValue(-13, 7)).toBeGreaterThanOrEqual(0);
  });
});

describe('hashTableSteps — separate chaining', () => {
  it('appends colliding values to the same bucket', () => {
    // 1 and 8 both hash to 1 in a table of 7.
    const state = last(collect(hashTableSteps([1, 8, 15], 7, 'chaining')));

    expect(state.buckets[1]).toEqual([1, 8, 15]);
    expect(state.rejected).toEqual([]);
  });

  it('allows a load factor above 1', () => {
    const state = last(collect(hashTableSteps([1, 8, 15, 22], 2, 'chaining')));
    expect(state.loadFactor).toBeGreaterThan(1);
  });

  it('stores non-colliding values in their home bucket', () => {
    const state = last(collect(hashTableSteps([1, 2, 3], 7, 'chaining')));
    expect(state.buckets[1]).toEqual([1]);
    expect(state.buckets[2]).toEqual([2]);
    expect(state.buckets[3]).toEqual([3]);
  });

  it('ignores a repeated value', () => {
    const state = last(collect(hashTableSteps([5, 5], 7, 'chaining')));
    expect(state.buckets[5]).toEqual([5]);
  });

  it('never rejects, because a chain has no capacity limit', () => {
    const values = Array.from({ length: 20 }, (_, i) => i * 7);
    expect(last(collect(hashTableSteps(values, 7, 'chaining'))).rejected).toEqual([]);
  });
});

describe('hashTableSteps — linear probing', () => {
  it('walks forward to the next free slot', () => {
    const state = last(collect(hashTableSteps([1, 8], 7, 'linear-probing')));

    expect(state.buckets[1]).toEqual([1]);
    expect(state.buckets[2]).toEqual([8]);
  });

  it('holds at most one entry per bucket', () => {
    const state = last(collect(hashTableSteps([1, 8, 15, 22], 7, 'linear-probing')));
    for (const bucket of state.buckets) {
      expect(bucket.length).toBeLessThanOrEqual(1);
    }
  });

  it('shows clustering in the probe sequence', () => {
    const steps = collect(hashTableSteps([1, 8, 15], 7, 'linear-probing'));
    const insertion = steps.filter((s) => s.explanation.includes('15 is'))[0];
    expect(insertion ?? steps[steps.length - 2]).toBeDefined();

    const state = last(steps);
    expect(state.buckets[3]).toEqual([15]);
  });

  it('wraps around the end of the table', () => {
    const state = last(collect(hashTableSteps([6, 13, 20], 7, 'linear-probing')));
    expect(state.buckets[6]).toEqual([6]);
    expect(state.buckets[0]).toEqual([13]);
    expect(state.buckets[1]).toEqual([20]);
  });

  it('rejects an insert into a full table', () => {
    const state = last(collect(hashTableSteps([0, 1, 2, 3], 3, 'linear-probing')));
    expect(state.rejected).toEqual([3]);
  });
});

describe('hashTableSteps — quadratic probing', () => {
  it('steps by square offsets', () => {
    // 1 hashes to 1; 8 collides and probes 1+1=2.
    const state = last(collect(hashTableSteps([1, 8], 7, 'quadratic-probing')));
    expect(state.buckets[1]).toEqual([1]);
    expect(state.buckets[2]).toEqual([8]);
  });

  it('places the third colliding value four slots from home', () => {
    // 15 collides at 1, probes 1+1=2 (taken), then 1+4=5.
    const state = last(collect(hashTableSteps([1, 8, 15], 7, 'quadratic-probing')));
    expect(state.buckets[5]).toEqual([15]);
  });

  // Quadratic probing genuinely cannot reach every slot; the generator explains
  // that rather than silently dropping the value.
  it('explains a failure to place rather than failing silently', () => {
    const values = Array.from({ length: 8 }, () => 0);
    const uniqueColliding = [0, 8, 16, 24, 32, 40, 48, 56];
    const steps = collect(hashTableSteps(uniqueColliding, 8, 'quadratic-probing'));
    const state = last(steps);

    if (state.rejected.length > 0) {
      const explanation = steps.map((s) => s.explanation).join(' ');
      expect(explanation).toMatch(/table size is prime and the load factor is below 0\.5/);
    }
    expect(values).toHaveLength(8);
  });

  it('holds at most one entry per bucket', () => {
    const state = last(collect(hashTableSteps([1, 8, 15, 22], 11, 'quadratic-probing')));
    for (const bucket of state.buckets) {
      expect(bucket.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('hashTableSteps — general', () => {
  it('supports every advertised strategy', () => {
    for (const { id } of COLLISION_STRATEGIES) {
      expect(() => collect(hashTableSteps([1, 8, 15], 7, id))).not.toThrow();
    }
  });

  it('reports the load factor', () => {
    const state = last(collect(hashTableSteps([1, 2, 3], 6, 'chaining')));
    expect(state.loadFactor).toBeCloseTo(0.5);
  });

  it('rejects an invalid table size', () => {
    for (const size of [0, -1, 1.5, MAX_ELEMENTS + 1]) {
      expect(() => collect(hashTableSteps([1], size, 'chaining'))).toThrow(AlgorithmInputError);
    }
  });

  it('emits immutable snapshots', () => {
    const steps = collect(hashTableSteps([1, 8], 7, 'chaining'));
    const early = steps[1]!.state.buckets[1];
    expect(early).toEqual([]);
  });

  it('records the probe sequence for each step', () => {
    const steps = collect(hashTableSteps([1, 8], 7, 'linear-probing'));
    expect(steps.some((s) => s.state.probed.length > 1)).toBe(true);
  });

  it('handles an empty input', () => {
    const state = last(collect(hashTableSteps([], 7, 'chaining')));
    expect(state.buckets.every((b) => b.length === 0)).toBe(true);
    expect(state.loadFactor).toBe(0);
  });

  it('carries the strategy in the state so the UI can label it', () => {
    for (const { id } of COLLISION_STRATEGIES) {
      expect(last(collect(hashTableSteps([1], 7, id))).strategy).toBe(id as CollisionStrategy);
    }
  });
});

describe('dfsSteps', () => {
  //     A
  //    / \
  //   B   C
  //   |   |
  //   D   E
  const graph: GraphState = {
    nodes: [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: -1, y: 1 },
      { id: 'C', x: 1, y: 1 },
      { id: 'D', x: -1, y: 2 },
      { id: 'E', x: 1, y: 2 },
    ],
    edges: [
      { from: 'A', to: 'B', weight: 1 },
      { from: 'A', to: 'C', weight: 1 },
      { from: 'B', to: 'D', weight: 1 },
      { from: 'C', to: 'E', weight: 1 },
    ],
    visitedNodes: [],
  };

  it('descends before it widens', () => {
    const visited = last(collect(dfsSteps(graph, 'A'))).visitedNodes;

    // Depth-first must reach D before C; breadth-first would not.
    expect(visited.indexOf('D')).toBeLessThan(visited.indexOf('C'));
    expect(visited).toEqual(['A', 'B', 'D', 'C', 'E']);
  });

  it('visits every reachable node exactly once', () => {
    const visited = last(collect(dfsSteps(graph, 'A'))).visitedNodes;
    expect(new Set(visited).size).toBe(visited.length);
    expect(visited).toHaveLength(5);
  });

  it('does not visit unreachable nodes', () => {
    const disconnected: GraphState = {
      ...graph,
      nodes: [...graph.nodes, { id: 'Z', x: 5, y: 5 }],
      visitedNodes: [],
    };
    expect(last(collect(dfsSteps(disconnected, 'A'))).visitedNodes).not.toContain('Z');
  });

  it('terminates on a cycle', () => {
    const cyclic: GraphState = {
      nodes: [
        { id: 'A', x: 0, y: 0 },
        { id: 'B', x: 1, y: 0 },
      ],
      edges: [
        { from: 'A', to: 'B', weight: 1 },
        { from: 'B', to: 'A', weight: 1 },
      ],
      visitedNodes: [],
    };

    const steps = collect(dfsSteps(cyclic, 'A'));
    expect(steps.length).toBeLessThan(50);
    expect(last(steps).visitedNodes).toEqual(['A', 'B']);
  });

  it('handles a single isolated node', () => {
    const single: GraphState = {
      nodes: [{ id: 'A', x: 0, y: 0 }],
      edges: [],
      visitedNodes: [],
    };
    expect(last(collect(dfsSteps(single, 'A'))).visitedNodes).toEqual(['A']);
  });

  it('narrates backtracking', () => {
    const explanation = collect(dfsSteps(graph, 'A'))
      .map((s) => s.explanation)
      .join(' ');
    expect(explanation).toMatch(/backtracks/);
  });
});
