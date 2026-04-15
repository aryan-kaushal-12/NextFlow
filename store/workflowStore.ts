'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current } from 'immer';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
  Viewport,
} from 'reactflow';
import { WorkflowNode, WorkflowEdge } from '@/types/workflow';

interface HistoryEntry {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface RunHistoryItem {
  id: string;
  workflowId: string;
  status: string;
  scope: string;
  duration?: number | null;
  createdAt: string;
  nodeExecutions?: Array<{
    id: string;
    nodeId: string;
    nodeType: string;
    nodeLabel?: string | null;
    status: string;
    inputs?: unknown;
    outputs?: unknown;
    error?: string | null;
    duration?: number | null;
    createdAt: string;
  }>;
}

interface WorkflowStore {
  // Workflow identity
  workflowId: string | null;
  workflowName: string;

  // React Flow state
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];

  // Undo / redo
  past: HistoryEntry[];
  future: HistoryEntry[];

  // Execution
  isRunning: boolean;
  runningNodeIds: string[];
  nodeOutputs: Record<string, Record<string, string>>; // nodeId → handleId → value
  activeRunId: string | null;

  // Run history
  runHistory: RunHistoryItem[];
  loadingHistory: boolean;

  // Sidebar
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;

  /** Canvas pan/zoom; persisted with workflow */
  viewport: Viewport | null;

  /** Currently selected node ids (synced from React Flow) */
  selectedNodeIds: string[];

  /** Incremented from toolbar to request fit view inside ReactFlow */
  fitViewNonce: number;

  // Actions
  setWorkflowId: (id: string) => void;
  setWorkflowName: (name: string) => void;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (node: WorkflowNode) => void;
  updateNodeData: (nodeId: string, data: Partial<WorkflowNode['data']>) => void;
  setNodes: (nodes: WorkflowNode[]) => void;
  setEdges: (edges: WorkflowEdge[]) => void;

  undo: () => void;
  redo: () => void;

  setIsRunning: (v: boolean) => void;
  setRunningNodeIds: (ids: string[]) => void;
  setNodeOutput: (nodeId: string, handle: string, value: string) => void;
  clearNodeOutputs: () => void;
  setActiveRunId: (id: string | null) => void;

  setRunHistory: (history: RunHistoryItem[]) => void;
  prependRun: (run: RunHistoryItem) => void;
  updateRun: (runId: string, updates: Partial<RunHistoryItem>) => void;
  setLoadingHistory: (v: boolean) => void;

  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;

  saveHistorySnapshot: () => void;
  setViewport: (v: Viewport) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  requestFitView: () => void;
}

export const useWorkflowStore = create<WorkflowStore>()(
  immer((set, get) => ({
    workflowId: null,
    workflowName: 'Untitled Workflow',
    nodes: [],
    edges: [],
    past: [],
    future: [],
    isRunning: false,
    runningNodeIds: [],
    nodeOutputs: {},
    activeRunId: null,
    runHistory: [],
    loadingHistory: false,
    leftSidebarOpen: true,
    rightSidebarOpen: true,
    viewport: null,
    selectedNodeIds: [],
    fitViewNonce: 0,

    setWorkflowId: (id) => set(s => { s.workflowId = id; }),
    setWorkflowName: (name) => set(s => { s.workflowName = name; }),

    saveHistorySnapshot: () =>
      set(s => {
        s.past.push({ nodes: JSON.parse(JSON.stringify(s.nodes)), edges: JSON.parse(JSON.stringify(s.edges)) });
        if (s.past.length > 50) s.past.shift();
        s.future = [];
      }),

    onNodesChange: (changes) => {
      const shouldSnapshot = changes.some((ch: NodeChange) => {
        if (ch.type === 'remove') return true;
        if (ch.type === 'dimensions') return true;
        if (ch.type === 'position' && 'dragging' in ch && ch.dragging === false) return true;
        return false;
      });
      if (shouldSnapshot) get().saveHistorySnapshot();
      set(s => {
        // Plain arrays — React Flow helpers break on Immer draft proxies
        s.nodes = applyNodeChanges(changes, current(s.nodes)) as WorkflowNode[];
      });
    },

    onEdgesChange: (changes) => {
      const shouldSnapshot = changes.some(ch => ch.type === 'remove');
      if (shouldSnapshot) get().saveHistorySnapshot();
      set(s => {
        s.edges = applyEdgeChanges(changes, current(s.edges)) as WorkflowEdge[];
      });
    },

    onConnect: (connection) =>
      set(s => {
        s.past.push({ nodes: JSON.parse(JSON.stringify(s.nodes)), edges: JSON.parse(JSON.stringify(s.edges)) });
        s.future = [];
        s.edges = addEdge(
          { ...connection, animated: true, style: { stroke: '#A855F7', strokeWidth: 2 } },
          current(s.edges)
        ) as WorkflowEdge[];
      }),

    addNode: (node) =>
      set(s => {
        s.past.push({ nodes: JSON.parse(JSON.stringify(s.nodes)), edges: JSON.parse(JSON.stringify(s.edges)) });
        s.future = [];
        s.nodes.push(node);
      }),

    updateNodeData: (nodeId, data) =>
      set(s => {
        const node = s.nodes.find(n => n.id === nodeId);
        if (node) Object.assign(node.data, data);
      }),

    setNodes: (nodes) => set(s => { s.nodes = nodes; }),
    setEdges: (edges) => set(s => { s.edges = edges; }),

    undo: () =>
      set(s => {
        const prev = s.past.pop();
        if (!prev) return;
        s.future.push({ nodes: JSON.parse(JSON.stringify(s.nodes)), edges: JSON.parse(JSON.stringify(s.edges)) });
        s.nodes = prev.nodes;
        s.edges = prev.edges;
      }),

    redo: () =>
      set(s => {
        const next = s.future.pop();
        if (!next) return;
        s.past.push({ nodes: JSON.parse(JSON.stringify(s.nodes)), edges: JSON.parse(JSON.stringify(s.edges)) });
        s.nodes = next.nodes;
        s.edges = next.edges;
      }),

    setIsRunning: (v) => set(s => { s.isRunning = v; }),
    setRunningNodeIds: (ids) => set(s => { s.runningNodeIds = ids; }),
    setNodeOutput: (nodeId, handle, value) =>
      set(s => {
        if (!s.nodeOutputs[nodeId]) s.nodeOutputs[nodeId] = {};
        s.nodeOutputs[nodeId][handle] = value;
      }),
    clearNodeOutputs: () => set(s => { s.nodeOutputs = {}; }),
    setActiveRunId: (id) => set(s => { s.activeRunId = id; }),

    setRunHistory: (history) => set(s => { s.runHistory = history; }),
    prependRun: (run) => set(s => { s.runHistory.unshift(run); }),
    updateRun: (runId, updates) =>
      set(s => {
        const idx = s.runHistory.findIndex(r => r.id === runId);
        if (idx >= 0) Object.assign(s.runHistory[idx], updates);
      }),
    setLoadingHistory: (v) => set(s => { s.loadingHistory = v; }),

    toggleLeftSidebar: () => set(s => { s.leftSidebarOpen = !s.leftSidebarOpen; }),
    toggleRightSidebar: () => set(s => { s.rightSidebarOpen = !s.rightSidebarOpen; }),

    setViewport: (v) => set(s => { s.viewport = { x: v.x, y: v.y, zoom: v.zoom }; }),

    setSelectedNodeIds: (ids) => set(s => { s.selectedNodeIds = ids; }),

    requestFitView: () => set(s => { s.fitViewNonce += 1; }),
  }))
);
