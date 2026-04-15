'use client';

import { useEffect, useCallback, useRef, useMemo } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  NodeTypes,
  useReactFlow,
  ReactFlowProvider,
  type OnSelectionChangeFunc,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useWorkflowStore } from '@/store/workflowStore';
import { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import { isConnectionValid } from '@/lib/execution-engine';

import LeftSidebar from './sidebar/LeftSidebar';
import RightSidebar from './sidebar/RightSidebar';
import Toolbar from './Toolbar';

import TextNode from './nodes/TextNode';
import UploadImageNode from './nodes/UploadImageNode';
import UploadVideoNode from './nodes/UploadVideoNode';
import LLMNode from './nodes/LLMNode';
import CropImageNode from './nodes/CropImageNode';
import ExtractFrameNode from './nodes/ExtractFrameNode';

const nodeTypes: NodeTypes = {
  textNode: TextNode,
  uploadImageNode: UploadImageNode,
  uploadVideoNode: UploadVideoNode,
  llmNode: LLMNode,
  cropImageNode: CropImageNode,
  extractFrameNode: ExtractFrameNode,
};

function CanvasEffects() {
  const fitViewNonce = useWorkflowStore(s => s.fitViewNonce);
  const { fitView } = useReactFlow();
  const prevNonce = useRef(0);

  useEffect(() => {
    if (fitViewNonce > 0 && fitViewNonce !== prevNonce.current) {
      prevNonce.current = fitViewNonce;
      fitView({ padding: 0.15, duration: 200 });
    }
  }, [fitViewNonce, fitView]);

  return null;
}

interface Props {
  workflowId: string;
  workflowName: string;
  initialNodes: any[];
  initialEdges: any[];
  initialViewport?: { x: number; y: number; zoom: number } | null;
}

function FlowCanvas({
  workflowId,
  initialViewport,
}: {
  workflowId: string;
  initialViewport?: { x: number; y: number; zoom: number } | null;
}) {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    undo, redo,
    runningNodeIds,
    setViewport,
    setSelectedNodeIds,
  } = useWorkflowStore();
  const { screenToFlowPosition } = useReactFlow();

  // Must memoize: new node objects every render make React Flow think props changed,
  // which retriggers onSelectionChange → setSelectedNodeIds → infinite update loop.
  const styledNodes = useMemo(
    () =>
      nodes.map(n => ({
        ...n,
        className: ['workflow-node', runningNodeIds.includes(n.id) ? 'running' : '']
          .filter(Boolean)
          .join(' '),
      })),
    [nodes, runningNodeIds]
  );

  const selectionSigRef = useRef<string>('');
  useEffect(() => {
    selectionSigRef.current = '';
  }, [workflowId]);

  const onSelectionChange = useCallback<OnSelectionChangeFunc>(
    ({ nodes: sel }) => {
      const sig = sel
        .map(n => n.id)
        .sort()
        .join('\0');
      if (sig === selectionSigRef.current) return;
      selectionSigRef.current = sig;
      setSelectedNodeIds(sel.map(n => n.id));
    },
    [setSelectedNodeIds]
  );

  const viewportSigRef = useRef<string>('');
  useEffect(() => {
    viewportSigRef.current = '';
  }, [workflowId]);

  const onMoveEnd = useCallback(
    (_: MouseEvent | TouchEvent | null, vp: { x: number; y: number; zoom: number }) => {
      const sig = `${vp.x.toFixed(2)},${vp.y.toFixed(2)},${vp.zoom.toFixed(4)}`;
      if (sig === viewportSigRef.current) return;
      viewportSigRef.current = sig;
      setViewport(vp);
    },
    [setViewport]
  );

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const isValidConnection = useCallback((connection: { source: string | null; sourceHandle: string | null; target: string | null; targetHandle: string | null }) => {
    if (!connection.source || !connection.target) return false;
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    if (!sourceNode || !targetNode) return false;
    if (connection.source === connection.target) return false;
    return isConnectionValid(
      sourceNode.type || '',
      connection.sourceHandle || 'output',
      targetNode.type || '',
      connection.targetHandle || '',
    );
  }, [nodes]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('application/reactflow-nodetype');
    if (!nodeType) return;

    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const id = `${nodeType}-${Date.now()}`;

    const defaultData: Record<string, unknown> = { label: nodeType };
    if (nodeType === 'textNode') defaultData.text = '';
    if (nodeType === 'llmNode') defaultData.model = 'openai:gpt-4o-mini';
    if (nodeType === 'cropImageNode') {
      defaultData.x_percent = 0;
      defaultData.y_percent = 0;
      defaultData.width_percent = 100;
      defaultData.height_percent = 100;
    }
    if (nodeType === 'extractFrameNode') defaultData.timestamp = '00:00:00';

    const newNode: WorkflowNode = {
      id,
      type: nodeType,
      position,
      data: defaultData as unknown as WorkflowNode['data'],
    };
    useWorkflowStore.getState().addNode(newNode);
  }, [screenToFlowPosition]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const defaultVp = initialViewport && typeof initialViewport.zoom === 'number'
    ? initialViewport
    : { x: 0, y: 0, zoom: 1 };

  return (
    <ReactFlow
      nodes={styledNodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onDrop={onDrop}
      onDragOver={onDragOver}
      nodeTypes={nodeTypes}
      isValidConnection={isValidConnection}
      defaultViewport={defaultVp}
      onMoveEnd={onMoveEnd}
      onSelectionChange={onSelectionChange}
      fitView={!(initialViewport && typeof initialViewport.zoom === 'number')}
      deleteKeyCode={['Delete', 'Backspace']}
      defaultEdgeOptions={{ animated: true, style: { stroke: '#A855F7', strokeWidth: 2 } }}
      proOptions={{ hideAttribution: true }}
    >
      <CanvasEffects />
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2a2a2a" />
      <Controls position="bottom-left" />
      <MiniMap
        position="bottom-right"
        nodeColor={() => '#A855F7'}
        maskColor="rgba(0,0,0,0.6)"
        style={{ background: '#111', border: '1px solid #272727', borderRadius: 8 }}
      />
    </ReactFlow>
  );
}

export default function WorkflowEditor({ workflowId, workflowName, initialNodes, initialEdges, initialViewport }: Props) {
  const { setWorkflowId, setWorkflowName, setNodes, setEdges, setViewport, leftSidebarOpen, rightSidebarOpen, viewport } = useWorkflowStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setWorkflowId(workflowId);
    setWorkflowName(workflowName);
    setNodes((initialNodes || []) as any);
    setEdges((initialEdges || []) as any);
    if (initialViewport && typeof (initialViewport as { zoom?: number }).zoom === 'number') {
      setViewport(initialViewport as { x: number; y: number; zoom: number });
    }
  }, [workflowId, setWorkflowId, setWorkflowName, setNodes, setEdges, setViewport, initialNodes, initialEdges, initialViewport]);

  // Auto-save debounced
  const { nodes, edges } = useWorkflowStore();
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const vp = useWorkflowStore.getState().viewport;
      fetch('/api/workflow/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          nodes,
          edges,
          ...(vp ? { viewport: vp } : {}),
        }),
      });
    }, 2000);
  }, [nodes, edges, viewport, workflowId]);

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen" style={{ background: '#0A0A0A' }}>
        <Toolbar />
        <div className="flex flex-1 overflow-hidden">
          {leftSidebarOpen && <LeftSidebar />}
          <div className="flex-1 relative">
            <FlowCanvas workflowId={workflowId} initialViewport={initialViewport} />
          </div>
          {rightSidebarOpen && <RightSidebar />}
        </div>
      </div>
    </ReactFlowProvider>
  );
}
