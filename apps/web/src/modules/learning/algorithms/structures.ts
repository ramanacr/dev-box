/**
 * Step generators for the data-structure visualizers the white paper lists under
 * "Algorithm visualizer starter set": heap, binary search tree, and hash-table
 * collision strategies. DFS lives in graph.ts alongside BFS.
 *
 * Every generator emits immutable snapshots, matching the existing sorting and graph
 * generators, so the player can step forwards and backwards without re-running.
 * Limits mirror the existing modules: arrays are capped so a lesson cannot be made
 * to hang the tab.
 */
import { type Step } from './contracts';

export const MAX_ELEMENTS = 128;

export class AlgorithmInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlgorithmInputError';
  }
}

function assertSize(values: unknown[], label: string): void {
  if (values.length > MAX_ELEMENTS) {
    throw new AlgorithmInputError(`${label} is limited to ${MAX_ELEMENTS} elements.`);
  }
}

// --- binary heap ----------------------------------------------------------

export interface HeapState {
  /** Array-backed heap; children of i are at 2i+1 and 2i+2. */
  heap: number[];
  /** Indexes being compared or swapped in this step. */
  comparing: number[];
  /** Values already extracted, in extraction order. */
  extracted: number[];
}

/**
 * Builds a max-heap by sifting each value up as it is inserted.
 *
 * Insertion order matters for the shape of the tree, which is the point of the
 * visualisation: the same multiset produces a different valid heap depending on the
 * order values arrive.
 */
export function* heapInsertSteps(values: number[]): Generator<Step<HeapState>> {
  assertSize(values, 'Heap input');

  const heap: number[] = [];

  yield {
    state: { heap: [], comparing: [], extracted: [] },
    explanation: 'Starting with an empty max-heap.',
    highlighted: [],
  };

  for (const value of values) {
    heap.push(value);
    let index = heap.length - 1;

    yield {
      state: { heap: [...heap], comparing: [index], extracted: [] },
      explanation: `Inserted ${value} at the end, index ${index}. The heap property may now be violated upwards.`,
      highlighted: [index],
    };

    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);

      yield {
        state: { heap: [...heap], comparing: [index, parent], extracted: [] },
        explanation: `Comparing ${heap[index]} at index ${index} with its parent ${heap[parent]} at index ${parent}.`,
        highlighted: [index, parent],
      };

      if (heap[parent]! >= heap[index]!) {
        yield {
          state: { heap: [...heap], comparing: [index, parent], extracted: [] },
          explanation: `Parent ${heap[parent]} is not smaller, so ${heap[index]} has reached its place.`,
          highlighted: [index],
        };
        break;
      }

      const temp = heap[parent]!;
      heap[parent] = heap[index]!;
      heap[index] = temp;

      yield {
        state: { heap: [...heap], comparing: [parent], extracted: [] },
        explanation: `Swapped: ${heap[parent]} moves up to index ${parent}.`,
        highlighted: [parent, index],
      };

      index = parent;
    }
  }

  yield {
    state: { heap: [...heap], comparing: [], extracted: [] },
    explanation: `Heap built. The largest value, ${heap[0]}, is at the root.`,
    highlighted: heap.length > 0 ? [0] : [],
  };
}

/**
 * Repeatedly extracts the root and sifts the replacement down.
 *
 * This is the second half of heapsort, and it shows why a heap gives sorted output
 * in O(n log n) without a second array.
 */
export function* heapExtractSteps(values: number[]): Generator<Step<HeapState>> {
  assertSize(values, 'Heap input');

  // Build first, without narrating, so the extraction is the subject.
  const heap = [...values];
  for (let i = Math.floor(heap.length / 2) - 1; i >= 0; i--) {
    siftDown(heap, i, heap.length);
  }

  const extracted: number[] = [];

  yield {
    state: { heap: [...heap], comparing: [], extracted: [] },
    explanation: 'Starting from a valid max-heap.',
    highlighted: heap.length > 0 ? [0] : [],
  };

  let size = heap.length;
  while (size > 0) {
    const root = heap[0]!;

    yield {
      state: { heap: heap.slice(0, size), comparing: [0], extracted: [...extracted] },
      explanation: `The root ${root} is the largest remaining value; extract it.`,
      highlighted: [0],
    };

    extracted.push(root);
    heap[0] = heap[size - 1]!;
    size--;

    if (size > 0) {
      yield {
        state: { heap: heap.slice(0, size), comparing: [0], extracted: [...extracted] },
        explanation: `Moved the last element ${heap[0]} to the root. Now sift it down.`,
        highlighted: [0],
      };

      // Narrate the sift-down rather than calling the silent helper.
      let index = 0;
      for (;;) {
        const left = 2 * index + 1;
        const right = 2 * index + 2;
        let largest = index;

        if (left < size && heap[left]! > heap[largest]!) largest = left;
        if (right < size && heap[right]! > heap[largest]!) largest = right;

        if (largest === index) {
          yield {
            state: { heap: heap.slice(0, size), comparing: [index], extracted: [...extracted] },
            explanation: `${heap[index]} is larger than both children, so the heap property holds again.`,
            highlighted: [index],
          };
          break;
        }

        const comparing = [index, left, right].filter((i) => i < size);
        yield {
          state: { heap: heap.slice(0, size), comparing, extracted: [...extracted] },
          explanation: `${heap[largest]} at index ${largest} is the largest of the three; swap it up.`,
          highlighted: comparing,
        };

        const temp = heap[index]!;
        heap[index] = heap[largest]!;
        heap[largest] = temp;
        index = largest;
      }
    }
  }

  yield {
    state: { heap: [], comparing: [], extracted: [...extracted] },
    explanation: `Heap empty. Extracted in descending order: ${extracted.join(', ')}.`,
    highlighted: [],
  };
}

function siftDown(heap: number[], start: number, size: number): void {
  let index = start;
  for (;;) {
    const left = 2 * index + 1;
    const right = 2 * index + 2;
    let largest = index;

    if (left < size && heap[left]! > heap[largest]!) largest = left;
    if (right < size && heap[right]! > heap[largest]!) largest = right;
    if (largest === index) return;

    const temp = heap[index]!;
    heap[index] = heap[largest]!;
    heap[largest] = temp;
    index = largest;
  }
}

// --- binary search tree ---------------------------------------------------

export interface BstNode {
  value: number;
  left: BstNode | null;
  right: BstNode | null;
}

export interface BstState {
  root: BstNode | null;
  /** Values on the path currently being walked. */
  path: number[];
  /** In-order traversal so far, when traversing. */
  traversal: number[];
}

/** Deep-copies the tree so each emitted snapshot is immutable. */
function cloneTree(node: BstNode | null): BstNode | null {
  if (!node) return null;
  return { value: node.value, left: cloneTree(node.left), right: cloneTree(node.right) };
}

/**
 * Inserts values one at a time, narrating the comparison at each node.
 *
 * Duplicates are rejected rather than silently placed on one side, because which
 * side they go to is a convention rather than a property of the structure, and a
 * learner should be told that rather than shown an arbitrary choice.
 */
export function* bstInsertSteps(values: number[]): Generator<Step<BstState>> {
  assertSize(values, 'Tree input');

  let root: BstNode | null = null;

  yield {
    state: { root: null, path: [], traversal: [] },
    explanation: 'Starting with an empty binary search tree.',
    highlighted: [],
  };

  for (const value of values) {
    if (!root) {
      root = { value, left: null, right: null };
      yield {
        state: { root: cloneTree(root), path: [value], traversal: [] },
        explanation: `The tree was empty, so ${value} becomes the root.`,
        highlighted: [value],
      };
      continue;
    }

    const path: number[] = [];
    let node: BstNode = root;
    let placed = false;

    for (;;) {
      path.push(node.value);

      if (value === node.value) {
        yield {
          state: { root: cloneTree(root), path: [...path], traversal: [] },
          explanation: `${value} is already in the tree. A binary search tree holds a set, so this insert is skipped.`,
          highlighted: [...path],
        };
        placed = true;
        break;
      }

      const goLeft = value < node.value;
      yield {
        state: { root: cloneTree(root), path: [...path], traversal: [] },
        explanation: `${value} ${goLeft ? '<' : '>'} ${node.value}, so go ${goLeft ? 'left' : 'right'}.`,
        highlighted: [...path],
      };

      const child = goLeft ? node.left : node.right;
      if (!child) {
        const created: BstNode = { value, left: null, right: null };
        if (goLeft) node.left = created;
        else node.right = created;

        path.push(value);
        yield {
          state: { root: cloneTree(root), path: [...path], traversal: [] },
          explanation: `No ${goLeft ? 'left' : 'right'} child, so ${value} is inserted here.`,
          highlighted: [value],
        };
        placed = true;
        break;
      }

      node = child;
    }

    if (!placed) break;
  }

  yield {
    state: { root: cloneTree(root), path: [], traversal: [] },
    explanation: 'All values inserted. An in-order walk of this tree yields them sorted.',
    highlighted: [],
  };
}

/**
 * In-order traversal, which is the property that makes a BST useful: it emits the
 * values in sorted order without sorting anything.
 */
export function* bstInOrderSteps(values: number[]): Generator<Step<BstState>> {
  assertSize(values, 'Tree input');

  let root: BstNode | null = null;
  for (const value of values) {
    root = insert(root, value);
  }

  const traversal: number[] = [];

  yield {
    state: { root: cloneTree(root), path: [], traversal: [] },
    explanation: 'Walking the tree in order: left subtree, then node, then right subtree.',
    highlighted: [],
  };

  yield* walk(root, []);

  yield {
    state: { root: cloneTree(root), path: [], traversal: [...traversal] },
    explanation: `Traversal complete: ${traversal.join(', ')} — sorted, with no comparison sort involved.`,
    highlighted: [],
  };

  function* walk(node: BstNode | null, path: number[]): Generator<Step<BstState>> {
    if (!node) return;

    const here = [...path, node.value];

    if (node.left) {
      yield {
        state: { root: cloneTree(root), path: here, traversal: [...traversal] },
        explanation: `At ${node.value}: descend into the left subtree first.`,
        highlighted: here,
      };
      yield* walk(node.left, here);
    }

    traversal.push(node.value);
    yield {
      state: { root: cloneTree(root), path: here, traversal: [...traversal] },
      explanation: `Left subtree of ${node.value} is done, so emit ${node.value}.`,
      highlighted: [node.value],
    };

    if (node.right) {
      yield {
        state: { root: cloneTree(root), path: here, traversal: [...traversal] },
        explanation: `Now descend into the right subtree of ${node.value}.`,
        highlighted: here,
      };
      yield* walk(node.right, here);
    }
  }
}

function insert(node: BstNode | null, value: number): BstNode {
  if (!node) return { value, left: null, right: null };
  if (value < node.value) node.left = insert(node.left, value);
  else if (value > node.value) node.right = insert(node.right, value);
  return node;
}

/** Searches for a value, narrating the halving of the search space. */
export function* bstSearchSteps(values: number[], target: number): Generator<Step<BstState>> {
  assertSize(values, 'Tree input');

  let root: BstNode | null = null;
  for (const value of values) root = insert(root, value);

  const path: number[] = [];
  let node = root;

  yield {
    state: { root: cloneTree(root), path: [], traversal: [] },
    explanation: `Searching for ${target}. Each comparison discards one subtree.`,
    highlighted: [],
  };

  while (node) {
    path.push(node.value);

    if (node.value === target) {
      yield {
        state: { root: cloneTree(root), path: [...path], traversal: [] },
        explanation: `Found ${target} after ${path.length} comparison${path.length === 1 ? '' : 's'}.`,
        highlighted: [target],
      };
      return;
    }

    const goLeft = target < node.value;
    yield {
      state: { root: cloneTree(root), path: [...path], traversal: [] },
      explanation: `${target} ${goLeft ? '<' : '>'} ${node.value}, so the ${goLeft ? 'right' : 'left'} subtree cannot contain it. Go ${goLeft ? 'left' : 'right'}.`,
      highlighted: [...path],
    };

    node = goLeft ? node.left : node.right;
  }

  yield {
    state: { root: cloneTree(root), path: [...path], traversal: [] },
    explanation: `Reached a missing child, so ${target} is not in the tree.`,
    highlighted: [...path],
  };
}

// --- hash table -----------------------------------------------------------

export type CollisionStrategy = 'chaining' | 'linear-probing' | 'quadratic-probing';

export const COLLISION_STRATEGIES: { id: CollisionStrategy; label: string; summary: string }[] = [
  {
    id: 'chaining',
    label: 'Separate chaining',
    summary: 'Each bucket holds a list. Collisions append to that list, so load factor may exceed 1.',
  },
  {
    id: 'linear-probing',
    label: 'Linear probing',
    summary: 'On a collision, walk forward one slot at a time. Cache-friendly, but collisions cluster.',
  },
  {
    id: 'quadratic-probing',
    label: 'Quadratic probing',
    summary: 'On a collision, step 1, 4, 9, … slots away. Spreads clusters, but can fail to find a free slot.',
  },
];

export interface HashTableState {
  /** One entry list per bucket. Open addressing uses at most one entry each. */
  buckets: number[][];
  strategy: CollisionStrategy;
  /** Buckets touched during this step, in probe order. */
  probed: number[];
  /** Insertions that could not be placed. */
  rejected: number[];
  loadFactor: number;
}

/** Deliberately simple so the collision behaviour is visible at small table sizes. */
export function hashValue(value: number, size: number): number {
  // Math.abs keeps a negative key inside the table; the modulo does the rest.
  return Math.abs(value) % size;
}

export function* hashTableSteps(
  values: number[],
  size: number,
  strategy: CollisionStrategy,
): Generator<Step<HashTableState>> {
  assertSize(values, 'Hash table input');

  if (!Number.isInteger(size) || size < 1 || size > MAX_ELEMENTS) {
    throw new AlgorithmInputError(`Table size must be an integer between 1 and ${MAX_ELEMENTS}.`);
  }

  const buckets: number[][] = Array.from({ length: size }, () => []);
  const rejected: number[] = [];
  let stored = 0;

  const snapshot = (probed: number[]): HashTableState => ({
    buckets: buckets.map((b) => [...b]),
    strategy,
    probed,
    rejected: [...rejected],
    loadFactor: stored / size,
  });

  yield {
    state: snapshot([]),
    explanation: `Empty table with ${size} buckets, using ${strategy.replace('-', ' ')}.`,
    highlighted: [],
  };

  for (const value of values) {
    const home = hashValue(value, size);

    yield {
      state: snapshot([home]),
      explanation: `${value} hashes to bucket ${home} (|${value}| mod ${size}).`,
      highlighted: [home],
    };

    if (strategy === 'chaining') {
      if (buckets[home]!.includes(value)) {
        yield {
          state: snapshot([home]),
          explanation: `${value} is already in bucket ${home}; nothing to do.`,
          highlighted: [home],
        };
        continue;
      }

      const occupied = buckets[home]!.length > 0;
      buckets[home]!.push(value);
      stored++;

      yield {
        state: snapshot([home]),
        explanation: occupied
          ? `Bucket ${home} was already occupied, so ${value} is appended to its chain — now ${buckets[home]!.length} entries deep.`
          : `Bucket ${home} was free, so ${value} is stored there.`,
        highlighted: [home],
      };
      continue;
    }

    // Open addressing.
    const probed: number[] = [];
    let placed = false;

    for (let attempt = 0; attempt < size; attempt++) {
      const step = strategy === 'linear-probing' ? attempt : attempt * attempt;
      const index = (home + step) % size;
      probed.push(index);

      if (buckets[index]!.includes(value)) {
        yield {
          state: snapshot([...probed]),
          explanation: `${value} is already stored at bucket ${index}; nothing to do.`,
          highlighted: [index],
        };
        placed = true;
        break;
      }

      if (buckets[index]!.length === 0) {
        buckets[index]!.push(value);
        stored++;
        yield {
          state: snapshot([...probed]),
          explanation:
            attempt === 0
              ? `Bucket ${index} was free, so ${value} is stored there.`
              : `Bucket ${index} is free after ${attempt} probe${attempt === 1 ? '' : 's'}; ${value} is stored there.`,
          highlighted: [index],
        };
        placed = true;
        break;
      }

      yield {
        state: snapshot([...probed]),
        explanation: `Bucket ${index} holds ${buckets[index]![0]}, so probe ${strategy === 'linear-probing' ? 'the next slot' : `${attempt + 1}² = ${(attempt + 1) ** 2} slots ahead`}.`,
        highlighted: [index],
      };
    }

    if (!placed) {
      rejected.push(value);
      yield {
        state: snapshot([...probed]),
        explanation:
          strategy === 'quadratic-probing'
            ? `${value} could not be placed: quadratic probing visited ${new Set(probed).size} distinct buckets and found none free. This is a real limitation — quadratic probing is only guaranteed to find a free slot when the table size is prime and the load factor is below 0.5.`
            : `${value} could not be placed: the table is full.`,
        highlighted: [...probed],
      };
    }
  }

  yield {
    state: snapshot([]),
    explanation: `Done. Load factor ${(stored / size).toFixed(2)}${rejected.length > 0 ? `, ${rejected.length} value(s) rejected` : ''}.`,
    highlighted: [],
  };
}
