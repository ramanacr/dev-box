export interface Step<T> {
  state: T;
  explanation: string;
  highlighted: (string | number)[];
}

export interface GraphNode {
  id: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
}

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  visitedNodes: string[];
  currentEdge?: [string, string];
  distances?: Record<string, number>;
}
