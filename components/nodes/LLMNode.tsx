'use client';

import { Handle, Position, NodeProps, useEdges } from 'reactflow';
import NodeShell, { InputLabel } from './NodeShell';
import { Brain, ChevronDown, Copy, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { LLMNodeData, LLM_MODELS } from '@/types/workflow';
import { useState } from 'react';

export default function LLMNode({ id, data, selected }: NodeProps<LLMNodeData>) {
  const { updateNodeData, runningNodeIds } = useWorkflowStore();
  const [copied, setCopied] = useState(false);
  const edges = useEdges();

  const isRunning = runningNodeIds.includes(id);

  // Which input handles are connected?
  const connectedTargets = new Set(
    edges.filter(e => e.target === id).map(e => e.targetHandle)
  );

  const systemConnected = connectedTargets.has('system_prompt');
  const messageConnected = connectedTargets.has('user_message');
  const imagesConnected  = connectedTargets.has('images');

  const isHFModel = (data.model || 'openai:gpt-4o-mini').startsWith('hf:');
  const needsImageWarning = isHFModel && !imagesConnected;

  function copyResult() {
    if (!data.result) return;
    navigator.clipboard.writeText(data.result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const handles = [
    { id: 'system_prompt', label: 'system prompt', top: '22%', connected: systemConnected, optional: true },
    { id: 'user_message',  label: 'user message',  top: '47%', connected: messageConnected, optional: false },
    { id: 'images',        label: 'images',         top: '72%', connected: imagesConnected, optional: true },
  ];

  return (
    <NodeShell id={id} title="Run LLM" icon={<Brain />} accentColor="#A855F7" selected={selected} minWidth={280}>
      {/* Input handles — rendered as labels on left side */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        {handles.map(h => (
          <div key={h.id} style={{ position: 'relative', marginBottom: 6 }}>
            <Handle
              type="target"
              position={Position.Left}
              id={h.id}
              style={{ left: -5, top: '50%' }}
            />
            <div className="flex items-center gap-1.5 pl-1">
              <span style={{
                fontSize: '9px', fontFamily: 'monospace',
                color: h.connected ? '#A855F7' : h.optional ? '#444' : '#666',
                background: '#111',
                border: `1px solid ${h.connected ? '#A855F7' : '#272727'}`,
                borderRadius: 3, padding: '1px 5px',
              }}>
                {h.id}
              </span>
              <span style={{ fontSize: '9px', color: '#444' }}>
                {h.optional ? 'optional' : 'required'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Model selector */}
      <InputLabel>Model</InputLabel>
      <div className="relative nodrag mb-2">
        <select
          value={data.model || 'openai:gpt-4o-mini'}
          onChange={e => updateNodeData(id, { model: e.target.value })}
          className="w-full px-2.5 py-1.5 pr-6 appearance-none"
          style={{
            background: '#111', border: '1px solid #272727',
            color: '#E0E0E0', fontSize: '11px', borderRadius: 6,
            outline: 'none', cursor: 'pointer', width: '100%',
          }}
        >
          {LLM_MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#555', pointerEvents: 'none' }} />
      </div>

      {/* HF BLIP: warn when no image is connected */}
      {needsImageWarning && (
        <div className="flex items-start gap-1.5 nodrag" style={{
          marginBottom: 6, padding: '5px 8px',
          background: 'rgba(234,179,8,0.08)',
          border: '1px solid rgba(234,179,8,0.3)',
          borderRadius: 6,
        }}>
          <AlertTriangle size={11} style={{ color: '#EAB308', marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: '10px', color: '#EAB308', lineHeight: 1.5 }}>
            BLIP requires an image. Connect an image node to the <code style={{ fontSize: '9px' }}>images</code> handle.
          </span>
        </div>
      )}

      {/* Loading state */}
      {isRunning && (
        <div className="flex items-center gap-1.5" style={{
          marginTop: 4, padding: '6px 8px',
          background: 'rgba(168,85,247,0.06)',
          border: '1px solid rgba(168,85,247,0.2)',
          borderRadius: 6,
        }}>
          <Loader2 size={11} style={{ color: '#A855F7', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '10px', color: '#A855F7' }}>
            {isHFModel ? 'Captioning image…' : 'Generating…'}
          </span>
        </div>
      )}

      {/* Result display — shown after execution */}
      {!isRunning && data.result && (
        <div style={{ marginTop: 6 }}>
          <div className="flex items-center justify-between mb-1">
            <InputLabel>Result</InputLabel>
            <button onClick={copyResult} className="flex items-center gap-1" style={{ fontSize: '9px', color: '#555' }}>
              {copied ? <Check size={10} style={{ color: '#22C55E' }} /> : <Copy size={10} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div
            className="nodrag"
            style={{
              background: '#0D0D0D',
              border: '1px solid #272727',
              borderLeft: '2px solid #A855F7',
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: '11px',
              color: '#C0C0C0',
              maxHeight: 160,
              overflowY: 'auto',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {data.result}
          </div>
        </div>
      )}

      {!isRunning && data.error && (
        <div style={{
          marginTop: 6, padding: '6px 8px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 6, fontSize: '10px', color: '#EF4444',
          lineHeight: 1.5, wordBreak: 'break-word',
        }}>
          {data.error}
        </div>
      )}

      {/* Output handle */}
      <Handle type="source" position={Position.Right} id="output" style={{ right: -5, top: '50%' }} />
      <span style={{
        position: 'absolute', right: 10, top: '50%',
        transform: 'translateY(-50%)',
        fontSize: '9px', color: '#555', pointerEvents: 'none',
      }}>text</span>
    </NodeShell>
  );
}
