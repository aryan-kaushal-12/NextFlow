import { WorkflowNode, WorkflowEdge, ExecutionContext, HANDLE_TYPE_MAP } from '@/types/workflow';

// ─── DAG Utilities ────────────────────────────────────────────────────────────

export function hasCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
  const adj = new Map<string, string[]>();
  nodes.forEach(n => adj.set(n.id, []));
  edges.forEach(e => adj.get(e.source)?.push(e.target));

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string): boolean {
    visited.add(id);
    inStack.add(id);
    for (const neighbor of adj.get(id) || []) {
      if (!visited.has(neighbor) && dfs(neighbor)) return true;
      if (inStack.has(neighbor)) return true;
    }
    inStack.delete(id);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id) && dfs(node.id)) return true;
  }
  return false;
}

/** All nodes that are upstream of any id in `selected` (including selected). */
export function expandWithAncestors(
  selected: string[],
  edges: WorkflowEdge[]
): string[] {
  const set = new Set(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      if (set.has(e.target) && !set.has(e.source)) {
        set.add(e.source);
        changed = true;
      }
    }
  }
  return Array.from(set);
}

// Returns levels of nodes that can execute in parallel
export function topologicalLevels(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  selectedIds?: string[]
): WorkflowNode[][] {
  const filteredNodes = selectedIds
    ? nodes.filter(n => selectedIds.includes(n.id))
    : nodes;
  const filteredEdges = selectedIds
    ? edges.filter(e => selectedIds.includes(e.source) && selectedIds.includes(e.target))
    : edges;

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  filteredNodes.forEach(n => { inDegree.set(n.id, 0); adj.set(n.id, []); });
  filteredEdges.forEach(e => {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    adj.get(e.source)?.push(e.target);
  });

  const levels: WorkflowNode[][] = [];
  let queue = filteredNodes.filter(n => inDegree.get(n.id) === 0);

  while (queue.length > 0) {
    levels.push([...queue]);
    const nextQueue: WorkflowNode[] = [];
    for (const node of queue) {
      for (const neighborId of adj.get(node.id) || []) {
        const deg = (inDegree.get(neighborId) || 0) - 1;
        inDegree.set(neighborId, deg);
        if (deg === 0) {
          const n = filteredNodes.find(x => x.id === neighborId);
          if (n) nextQueue.push(n);
        }
      }
    }
    queue = nextQueue;
  }

  return levels;
}

// Resolve input value for a target handle by looking up connected edge + execution context
export function resolveInputs(
  nodeId: string,
  nodeType: string,
  edges: WorkflowEdge[],
  nodes: WorkflowNode[],
  ctx: ExecutionContext
): Record<string, string | string[]> {
  const resolved: Record<string, string | string[]> = {};
  const incomingEdges = edges.filter(e => e.target === nodeId);

  for (const edge of incomingEdges) {
    const sourceOutputs = ctx[edge.source] || {};
    const val = edge.sourceHandle ? sourceOutputs[edge.sourceHandle] : undefined;
    if (!val) continue;

    const targetHandle = edge.targetHandle || '';

    // images handle supports multiple connections
    if (targetHandle === 'images') {
      if (!resolved.images) resolved.images = [];
      (resolved.images as string[]).push(val);
    } else {
      resolved[targetHandle] = val;
    }
  }

  // Also pull static node data values as fallback for non-connected handles
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return resolved;
  const data = node.data as unknown as Record<string, unknown>;

  if (nodeType === 'cropImageNode') {
    if (!resolved.x_percent) resolved.x_percent = String(data.x_percent ?? 0);
    if (!resolved.y_percent) resolved.y_percent = String(data.y_percent ?? 0);
    if (!resolved.width_percent) resolved.width_percent = String(data.width_percent ?? 100);
    if (!resolved.height_percent) resolved.height_percent = String(data.height_percent ?? 100);
  }

  if (nodeType === 'extractFrameNode') {
    if (!resolved.timestamp) resolved.timestamp = String(data.timestamp ?? '00:00:00');
  }

  return resolved;
}

// Validate connection is type-safe
export function isConnectionValid(
  sourceNodeType: string,
  sourceHandle: string,
  targetNodeType: string,
  targetHandle: string
): boolean {
  const sourceType = HANDLE_TYPE_MAP[sourceNodeType]?.[sourceHandle];
  const targetType = HANDLE_TYPE_MAP[targetNodeType]?.[targetHandle];
  if (!sourceType || !targetType) return false;

  // images handle accepts image-url
  if (targetHandle === 'images') return sourceType === 'image-url';

  return sourceType === targetType;
}
