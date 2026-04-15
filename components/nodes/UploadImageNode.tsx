'use client';

import { useRef, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import NodeShell, { InputLabel } from './NodeShell';
import { Image, Upload, Loader2, X } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { UploadImageNodeData } from '@/types/workflow';

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.gif';

export default function UploadImageNode({ id, data, selected }: NodeProps<UploadImageNodeData>) {
  const { updateNodeData } = useWorkflowStore();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      let assembly = await res.json();

      if (!res.ok) throw new Error(assembly.error || 'Upload failed');

      if (!assembly.assembly_ssl_url) {
        throw new Error('No assembly URL returned from Transloadit');
      }

      for (let i = 0; i < 120; i++) {
        if (assembly.ok === 'ASSEMBLY_COMPLETED') break;
        if (assembly.error) throw new Error(assembly.error);
        await new Promise(r => setTimeout(r, 400));
        const p = await fetch(assembly.assembly_ssl_url);
        if (!p.ok) throw new Error(`Poll failed: ${p.status}`);
        assembly = await p.json();
      }

      const url = assembly.results?.handle?.[0]?.ssl_url || 
                  assembly.uploads?.[0]?.ssl_url ||
                  assembly.uploads?.[0]?.url;
      if (!url) {
        console.error('Assembly response:', assembly);
        throw new Error('No URL in results or uploads');
      }
      updateNodeData(id, { imageUrl: url });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <NodeShell id={id} title="Upload Image" icon={<Image />} accentColor="#10B981" selected={selected}>
      <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

      {data.imageUrl ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.imageUrl} alt="Uploaded" className="rounded-lg w-full object-cover" style={{ maxHeight: 140 }} />
          <button
            onClick={() => updateNodeData(id, { imageUrl: undefined })}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)' }}
          >
            <X size={10} style={{ color: '#fff' }} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="nodrag w-full flex flex-col items-center gap-2 py-5 rounded-lg transition-all"
          style={{ border: '1px dashed #333' }}
          onMouseEnter={e => { if (!uploading) e.currentTarget.style.borderColor = '#10B981'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; }}
        >
          {uploading
            ? <Loader2 size={18} style={{ color: '#10B981' }} className="animate-spin" />
            : <Upload size={18} style={{ color: '#555' }} />}
          <span style={{ fontSize: '11px', color: '#666' }}>
            {uploading ? 'Uploading...' : 'Click to upload image'}
          </span>
          <span style={{ fontSize: '10px', color: '#444' }}>jpg, jpeg, png, webp, gif</span>
        </button>
      )}

      {error && <p style={{ fontSize: '10px', color: '#EF4444', marginTop: 4 }}>{error}</p>}

      <Handle type="source" position={Position.Right} id="output" style={{ right: -5, top: '50%' }} />
      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: '#555', pointerEvents: 'none' }}>img</span>
    </NodeShell>
  );
}
