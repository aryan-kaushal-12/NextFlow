'use client';

import { Handle, Position, NodeProps, useEdges } from 'reactflow';
import NodeShell, { InputLabel } from './NodeShell';
import { Film } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { ExtractFrameNodeData } from '@/types/workflow';

export default function ExtractFrameNode({ id, data, selected }: NodeProps<ExtractFrameNodeData>) {
  const { updateNodeData } = useWorkflowStore();
  const edges = useEdges();
  const connectedTargets = new Set(edges.filter(e => e.target === id).map(e => e.targetHandle));

  const videoConnected = connectedTargets.has('video_url');
  const tsConnected = connectedTargets.has('timestamp');

  return (
    <NodeShell id={id} title="Extract Frame" icon={<Film />} accentColor="#14B8A6" selected={selected} minWidth={260}>

      {/* video_url input */}
      <div className="flex items-center gap-1.5 mb-3" style={{ position: 'relative' }}>
        <Handle type="target" position={Position.Left} id="video_url" style={{ left: -5, top: '50%' }} />
        <span style={{
          fontSize: '9px', fontFamily: 'monospace',
          color: videoConnected ? '#14B8A6' : '#555',
          background: '#111',
          border: `1px solid ${videoConnected ? '#14B8A6' : '#272727'}`,
          borderRadius: 3, padding: '1px 5px',
        }}>video_url</span>
        <span style={{ fontSize: '9px', color: '#444' }}>required</span>
      </div>

      {/* timestamp input */}
      <div style={{ marginBottom: 12 }}>
        <InputLabel>Timestamp</InputLabel>
        <div className="flex items-center gap-2" style={{ position: 'relative' }}>
          <Handle type="target" position={Position.Left} id="timestamp" style={{ left: -5, top: '50%' }} />
          <input
            type="text"
            value={data.timestamp ?? '00:00:00'}
            disabled={tsConnected}
            onChange={e => updateNodeData(id, { timestamp: e.target.value })}
            placeholder='e.g. 00:01:30, 90, or "50%"'
            className="nodrag w-full px-2.5 py-1.5"
            style={{
              background: '#111', border: '1px solid #272727',
              color: tsConnected ? '#444' : '#E0E0E0',
              fontSize: '11px', borderRadius: 6, outline: 'none',
              opacity: tsConnected ? 0.4 : 1,
            }}
            onFocus={e => (e.target.style.borderColor = '#14B8A6')}
            onBlur={e => (e.target.style.borderColor = '#272727')}
          />
        </div>
        <p style={{ fontSize: '10px', color: '#444', marginTop: 3 }}>
          Use <code style={{ color: '#555' }}>hh:mm:ss</code> (e.g. <code style={{ color: '#555' }}>00:01:30</code>), seconds (e.g. <code style={{ color: '#555' }}>90</code>), or percentage (e.g. <code style={{ color: '#555' }}>50%</code>)
        </p>
      </div>

      {/* Result preview */}
      {data.result && (
        <div>
          <InputLabel>Extracted Frame</InputLabel>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.result}
            alt="Extracted frame"
            className="rounded-lg w-full object-cover"
            style={{ maxHeight: 120 }}
          />
        </div>
      )}

      {data.error && (
        <div style={{
          marginTop: 6, padding: '6px 8px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 6, fontSize: '10px', color: '#EF4444',
        }}>
          {data.error}
        </div>
      )}

      <Handle type="source" position={Position.Right} id="output" style={{ right: -5, top: '50%' }} />
      <span style={{
        position: 'absolute', right: 10, top: '50%',
        transform: 'translateY(-50%)',
        fontSize: '9px', color: '#555', pointerEvents: 'none',
      }}>img</span>
    </NodeShell>
  );
}
