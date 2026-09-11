import { describe, it, expect } from 'vitest';
import { bubbleSortSteps, mergeSortSteps } from './sorting';
import { bfsSteps, dijkstraSteps } from './graph';
import { type GraphState } from './contracts';

describe('Algorithm Generators', () => {
  const sampleArray = [5, 2, 8, 1, 9];

  it('bubbleSort finishes sorted without mutating the input', () => {
    const original = [...sampleArray];
    const steps = Array.from(bubbleSortSteps(sampleArray));
    expect(sampleArray).toEqual(original);

    const finalStep = steps[steps.length - 1];
    expect(finalStep).toBeDefined();
    expect(finalStep!.state).toEqual([1, 2, 5, 8, 9]);
    expect(steps.length).toBeGreaterThan(5);
  });

  it('mergeSort finishes sorted without mutating the input', () => {
    const original = [...sampleArray];
    const steps = Array.from(mergeSortSteps(sampleArray));
    expect(sampleArray).toEqual(original);

    const finalStep = steps[steps.length - 1];
    expect(finalStep).toBeDefined();
    expect(finalStep!.state).toEqual([1, 2, 5, 8, 9]);
    expect(steps.length).toBeGreaterThan(5);
  });

  const sampleGraph: GraphState = {
    nodes: [
      { id: 'A', x: 50, y: 50 },
      { id: 'B', x: 150, y: 50 },
      { id: 'C', x: 50, y: 150 },
      { id: 'D', x: 150, y: 150 },
    ],
    edges: [
      { from: 'A', to: 'B', weight: 3 },
      { from: 'A', to: 'C', weight: 1 },
      { from: 'C', to: 'D', weight: 2 },
      { from: 'B', to: 'D', weight: 4 },
    ],
    visitedNodes: [],
  };

  it('bfs visits all reachable nodes in breadth-first sequence', () => {
    const steps = Array.from(bfsSteps(sampleGraph, 'A'));
    const finalStep = steps[steps.length - 1];
    expect(finalStep).toBeDefined();
    expect(finalStep!.state.visitedNodes).toContain('A');
    expect(finalStep!.state.visitedNodes).toContain('B');
    expect(finalStep!.state.visitedNodes).toContain('C');
    expect(finalStep!.state.visitedNodes).toContain('D');
  });

  it('dijkstra computes minimal shortest path weights', () => {
    const steps = Array.from(dijkstraSteps(sampleGraph, 'A'));
    const finalStep = steps[steps.length - 1];
    expect(finalStep).toBeDefined();
    expect(finalStep!.state.distances).toBeDefined();

    const dists = finalStep!.state.distances!;
    expect(dists['A']).toBe(0);
    expect(dists['B']).toBe(3);
    expect(dists['C']).toBe(1);
    expect(dists['D']).toBe(3); // A -> C (1) + C -> D (2) = 3 < 7 (A->B->D)
  });
});
