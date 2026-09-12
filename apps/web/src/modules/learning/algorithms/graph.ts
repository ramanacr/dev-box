import { type GraphState, type Step } from './contracts';

export function* bfsSteps(
  initialGraph: GraphState,
  startNode: string
): Generator<Step<GraphState>> {
  const visited = new Set<string>();
  const queue: string[] = [startNode];
  visited.add(startNode);

  yield {
    state: {
      ...initialGraph,
      visitedNodes: Array.from(visited),
    },
    explanation: `Starting BFS from node "${startNode}". Added to queue.`,
    highlighted: [startNode],
  };

  while (queue.length > 0) {
    const curr = queue.shift()!;

    yield {
      state: {
        ...initialGraph,
        visitedNodes: Array.from(visited),
      },
      explanation: `Dequeued and visiting node "${curr}".`,
      highlighted: [curr],
    };

    // Find neighbors
    const outgoing = initialGraph.edges.filter((e) => e.from === curr);
    for (const edge of outgoing) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);

        yield {
          state: {
            ...initialGraph,
            visitedNodes: Array.from(visited),
            currentEdge: [edge.from, edge.to],
          },
          explanation: `Discovered unvisited neighbor "${edge.to}". Added to queue.`,
          highlighted: [edge.to],
        };
      }
    }
  }

  yield {
    state: {
      ...initialGraph,
      visitedNodes: Array.from(visited),
      currentEdge: undefined,
    },
    explanation: 'BFS traversal complete! All reachable nodes visited.',
    highlighted: [],
  };
}

export function* dijkstraSteps(
  initialGraph: GraphState,
  startNode: string
): Generator<Step<GraphState>> {
  const distances: Record<string, number> = {};
  for (const node of initialGraph.nodes) {
    distances[node.id] = Infinity;
  }
  distances[startNode] = 0;

  const visited = new Set<string>();
  const unvisited = new Set<string>(initialGraph.nodes.map((n) => n.id));

  yield {
    state: {
      ...initialGraph,
      visitedNodes: [],
      distances: { ...distances },
    },
    explanation: `Initialized Dijkstra. Distance to start node "${startNode}" is 0, all others are infinity.`,
    highlighted: [startNode],
  };

  while (unvisited.size > 0) {
    // Pick unvisited node with smallest distance
    let current: string | null = null;
    let minDist = Infinity;

    for (const nodeId of unvisited) {
      const d = distances[nodeId];
      if (d !== undefined && d < minDist) {
        minDist = d;
        current = nodeId;
      }
    }

    if (current === null || minDist === Infinity) {
      break; // Remaining nodes are unreachable
    }

    unvisited.delete(current);
    visited.add(current);

    yield {
      state: {
        ...initialGraph,
        visitedNodes: Array.from(visited),
        distances: { ...distances },
      },
      explanation: `Visiting node "${current}" with confirmed shortest distance ${minDist}.`,
      highlighted: [current],
    };

    // Relax neighbors
    const edges = initialGraph.edges.filter((e) => e.from === current);
    for (const edge of edges) {
      if (unvisited.has(edge.to)) {
        const newDist = minDist + edge.weight;
        const currentTargetDist = distances[edge.to] ?? Infinity;
        if (newDist < currentTargetDist) {
          distances[edge.to] = newDist;

          yield {
            state: {
              ...initialGraph,
              visitedNodes: Array.from(visited),
              currentEdge: [edge.from, edge.to],
              distances: { ...distances },
            },
            explanation: `Relaxed edge (${edge.from} -> ${edge.to}): Updated distance to ${newDist}.`,
            highlighted: [edge.to],
          };
        }
      }
    }
  }

  yield {
    state: {
      ...initialGraph,
      visitedNodes: Array.from(visited),
      currentEdge: undefined,
      distances: { ...distances },
    },
    explanation: 'Dijkstra complete! Shortest paths computed for all reachable nodes.',
    highlighted: [],
  };
}

/**
 * Depth-first traversal.
 *
 * The white paper lists "BFS/DFS" together; only BFS was implemented. Written with
 * an explicit stack rather than recursion so the frontier is a visible part of the
 * state — which is the whole point of contrasting it with BFS's queue.
 */
export function* dfsSteps(
  initialGraph: GraphState,
  startNode: string
): Generator<Step<GraphState>> {
  const visited = new Set<string>();
  const stack: string[] = [startNode];

  yield {
    state: { ...initialGraph, visitedNodes: [] },
    explanation: `Starting DFS from node "${startNode}". Pushed onto the stack.`,
    highlighted: [startNode],
  };

  while (stack.length > 0) {
    const curr = stack.pop()!;

    if (visited.has(curr)) {
      yield {
        state: { ...initialGraph, visitedNodes: Array.from(visited) },
        explanation: `Popped "${curr}", but it has already been visited — skip it. A node can be pushed more than once before it is first visited.`,
        highlighted: [curr],
      };
      continue;
    }

    visited.add(curr);

    yield {
      state: { ...initialGraph, visitedNodes: Array.from(visited) },
      explanation: `Popped and visiting "${curr}". Depth-first follows the most recently discovered node, not the nearest.`,
      highlighted: [curr],
    };

    // Neighbours are pushed in reverse so the first one listed is explored first,
    // which matches how a recursive implementation would behave.
    const neighbours = initialGraph.edges
      .filter((e) => e.from === curr)
      .map((e) => e.to)
      .filter((id) => !visited.has(id));

    for (let i = neighbours.length - 1; i >= 0; i--) {
      stack.push(neighbours[i]!);
    }

    if (neighbours.length > 0) {
      yield {
        state: {
          ...initialGraph,
          visitedNodes: Array.from(visited),
          currentEdge: [curr, neighbours[0]!],
        },
        explanation: `Pushed unvisited neighbours of "${curr}": ${neighbours.join(', ')}. "${neighbours[0]}" will be explored next.`,
        highlighted: neighbours,
      };
    } else {
      yield {
        state: { ...initialGraph, visitedNodes: Array.from(visited) },
        explanation: `"${curr}" has no unvisited neighbours, so the traversal backtracks.`,
        highlighted: [curr],
      };
    }
  }

  yield {
    state: { ...initialGraph, visitedNodes: Array.from(visited) },
    explanation: `DFS complete. Visited ${visited.size} node(s) in order: ${Array.from(visited).join(' → ')}.`,
    highlighted: [],
  };
}
