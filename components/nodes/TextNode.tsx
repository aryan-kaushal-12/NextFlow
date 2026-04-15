'use client';

import { Handle, Position, NodeProps } from 'reactflow';
import NodeShell, { InputLabel } from './NodeShell';
import { Type } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { TextNodeData } from '@/types/workflow';

export default function TextNode({ id, data, selected }: NodeProps<TextNodeData>) {
  const { updateNodeData } = useWorkflowStore();

  return (
    <NodeShell id={id} title="Text" icon={<Type />} accentColor="#3B82F6" selected={selected}>
      <InputLabel>Content</InputLabel>
      <textarea
        value={data.text || ''}
        onChange={e => updateNodeData(id, { text: e.target.value })}
        placeholder="Enter text..."
        rows={4}
        className="nodrag w-full px-2.5 py-2"
        style={{
          width: '100%', resize: 'vertical',
          background: '#111', border: '1px solid #272727',
          color: '#E0E0E0', fontSize: '12px', borderRadius: 6,
          outline: 'none', fontFamily: 'inherit',
        }}
        onFocus={e => (e.target.style.borderColor = '#3B82F6')}
        onBlur={e => (e.target.style.borderColor = '#272727')}
      />

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{ right: -5, top: '50%' }}
      />
      <span style={{
        position: 'absolute', right: 10, top: '50%',
        transform: 'translateY(-50%)',
        fontSize: '9px', color: '#555', pointerEvents: 'none',
      }}>text</span>
    </NodeShell>
  );
}
