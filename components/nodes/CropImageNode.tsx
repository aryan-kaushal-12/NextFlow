'use client';

import { Handle, Position, NodeProps, useEdges } from 'reactflow';
import NodeShell, { InputLabel } from './NodeShell';
import { Crop } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { CropImageNodeData } from '@/types/workflow';

interface ParamRowProps {
  label: string;
  handleId: string;
  value: number;
  connected: boolean;
  onChange: (v: number) => void;
  top: string;
}

function ParamRow({ label, handleId, value, connected, onChange, top }: ParamRowProps) {
  return (
    <div className="flex items-center gap-2 mb-2" style={{ position: 'relative' }}>
      <Handle
        type="target"
        position={Position.Left}
        id={handleId}
        style={{ left: -5, top }}
      />
      <span style={{
        fontSize: '9px', color: connected ? '#EC4899' : '#555',
        fontFamily: 'monospace', minWidth: 80,
        background: '#111',
        border: `1px solid ${connected ? '#EC4899' : '#272727'}`,
        borderRadius: 3, padding: '1px 5px',
      }}>
        {handleId}
      </span>
      <input
        type="number"
        min={0} max={100}
        value={value}
        disabled={connected}
        onChange={e => onChange(Number(e.target.value))}
        className="nodrag"
        style={{
          width: 54, padding: '2px 6px',
          background: '#111', border: '1px solid #272727',
          color: connected ? '#444' : '#E0E0E0',
          fontSize: '11px', borderRadius: 4, outline: 'none',
          opacity: connected ? 0.4 : 1,
        }}
        onFocus={e => (e.target.style.borderColor = '#EC4899')}
        onBlur={e => (e.target.style.borderColor = '#272727')}
      />
      <span style={{ fontSize: '9px', color: '#444' }}>%</span>
    </div>
  );
}

export default function CropImageNode({ id, data, selected }: NodeProps<CropImageNodeData>) {
  const { updateNodeData } = useWorkflowStore();
  const edges = useEdges();

  const connectedTargets = new Set(edges.filter(e => e.target === id).map(e => e.targetHandle));

  const params = [
    { id: 'x_percent',      key: 'x_percent',      label: 'X',      top: '20%' },
    { id: 'y_percent',      key: 'y_percent',      label: 'Y',      top: '38%' },
    { id: 'width_percent',  key: 'width_percent',  label: 'Width',  top: '56%' },
    { id: 'height_percent', key: 'height_percent', label: 'Height', top: '74%' },
  ];

  return (
    <NodeShell id={id} title="Crop Image" icon={<Crop />} accentColor="#EC4899" selected={selected} minWidth={270}>
      {/* Image input handle */}
      <div className="flex items-center gap-1.5 mb-3" style={{ position: 'relative' }}>
        <Handle
          type="target"
          position={Position.Left}
          id="image_url"
          style={{ left: -5, top: '50%' }}
        />
        <span style={{
          fontSize: '9px', fontFamily: 'monospace',
          color: connectedTargets.has('image_url') ? '#EC4899' : '#555',
          background: '#111',
          border: `1px solid ${connectedTargets.has('image_url') ? '#EC4899' : '#272727'}`,
          borderRadius: 3, padding: '1px 5px',
        }}>image_url</span>
        <span style={{ fontSize: '9px', color: '#444' }}>required</span>
      </div>

      <InputLabel>Crop Parameters (0–100%)</InputLabel>

      {params.map(p => (
        <ParamRow
          key={p.id}
          label={p.label}
          handleId={p.id}
          top={p.top}
          value={
            (data as unknown as Record<string, number>)[p.key] ??
            (p.key.includes('width') || p.key.includes('height') ? 100 : 0)
          }
          connected={connectedTargets.has(p.id)}
          onChange={v => updateNodeData(id, { [p.key]: v } as Partial<CropImageNodeData>)}
        />
      ))}

      {/* Result preview */}
      {data.result && (
        <div style={{ marginTop: 8 }}>
          <InputLabel>Result</InputLabel>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.result}
            alt="Cropped"
            className="rounded-lg w-full object-cover"
            style={{ maxHeight: 120 }}
          />
        </div>
      )}

      {data.error && (
        <div style={{
          marginTop: 6, padding: '6px 8px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
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
