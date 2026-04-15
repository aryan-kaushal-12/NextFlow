'use client';

import { useWorkflowStore } from '@/store/workflowStore';
import {
  Type, Image, Video, Brain, Crop, Film,
  Search, ChevronDown,
} from 'lucide-react';
import { WorkflowNode } from '@/types/workflow';

const NODE_TYPES = [
  {
    type: 'textNode',
    label: 'Text',
    description: 'Input text data',
    icon: Type,
    color: '#3B82F6',
    bg: 'rgba(59,130,246,0.1)',
  },
  {
    type: 'uploadImageNode',
    label: 'Upload Image',
    description: 'Upload via Transloadit',
    icon: Image,
    color: '#10B981',
    bg: 'rgba(16,185,129,0.1)',
  },
  {
    type: 'uploadVideoNode',
    label: 'Upload Video',
    description: 'Upload via Transloadit',
    icon: Video,
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.1)',
  },
  {
    type: 'llmNode',
    label: 'Run LLM',
    description: 'Ollama/Gemini via Trigger.dev',
    icon: Brain,
    color: '#A855F7',
    bg: 'rgba(168,85,247,0.1)',
  },
  {
    type: 'cropImageNode',
    label: 'Crop Image',
    description: 'Transloadit via Trigger.dev',
    icon: Crop,
    color: '#EC4899',
    bg: 'rgba(236,72,153,0.1)',
  },
  {
    type: 'extractFrameNode',
    label: 'Extract Frame',
    description: 'Transloadit via Trigger.dev',
    icon: Film,
    color: '#14B8A6',
    bg: 'rgba(20,184,166,0.1)',
  },
];

export default function LeftSidebar() {
  const { addNode } = useWorkflowStore();

  function handleDragStart(e: React.DragEvent, nodeType: string) {
    e.dataTransfer.setData('application/reactflow-nodetype', nodeType);
    e.dataTransfer.effectAllowed = 'move';
  }

  function addNodeToCanvas(nodeType: string) {
    const id = `${nodeType}-${Date.now()}`;
    const defaultData: Record<string, unknown> = { label: nodeType };
    if (nodeType === 'textNode') defaultData.text = '';
    if (nodeType === 'llmNode') defaultData.model = 'openai:gpt-4o-mini';
    if (nodeType === 'cropImageNode') {
      defaultData.x_percent = 0; defaultData.y_percent = 0;
      defaultData.width_percent = 100; defaultData.height_percent = 100;
    }
    if (nodeType === 'extractFrameNode') defaultData.timestamp = '00:00:00';

    const newNode: WorkflowNode = {
      id, type: nodeType,
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: defaultData as unknown as WorkflowNode['data'],
    };
    addNode(newNode);
  }

  return (
    <aside
      className="flex flex-col shrink-0"
      style={{
        width: 220, background: '#111111',
        borderRight: '1px solid #272727',
        overflowY: 'auto',
      }}
    >
      {/* Search */}
      <div className="p-3 pb-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: '#1A1A1A', border: '1px solid #272727' }}>
          <Search size={12} style={{ color: '#555' }} />
          <span style={{ color: '#555', fontSize: '12px' }}>Search nodes...</span>
        </div>
      </div>

      {/* Quick Access section */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-1 mb-2">
          <ChevronDown size={12} style={{ color: '#555' }} />
          <span style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
            Quick Access
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          {NODE_TYPES.map(({ type, label, description, icon: Icon, color, bg }) => (
            <button
              key={type}
              draggable
              onDragStart={(e) => handleDragStart(e, type)}
              onClick={() => addNodeToCanvas(type)}
              className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all w-full cursor-grab active:cursor-grabbing"
              style={{ border: '1px solid transparent' }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#1A1A1A';
                e.currentTarget.style.borderColor = '#333';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: bg }}
              >
                <Icon size={14} style={{ color }} />
              </div>
              <div className="min-w-0">
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#E0E0E0', lineHeight: 1.2 }}>{label}</p>
                <p style={{ fontSize: '10px', color: '#555', marginTop: 1 }}>{description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Help tip */}
      <div className="mt-auto p-3">
        <div className="p-2.5 rounded-lg" style={{ background: '#1A1A1A', border: '1px solid #272727' }}>
          <p style={{ fontSize: '10px', color: '#555', lineHeight: 1.5 }}>
            Click or drag nodes onto the canvas. Connect output → input handles to build your workflow.
          </p>
        </div>
      </div>
    </aside>
  );
}
