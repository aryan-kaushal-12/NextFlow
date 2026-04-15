'use client';

import { useRef, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import NodeShell from './NodeShell';
import { Video, Upload, Loader2, X } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { UploadVideoNodeData } from '@/types/workflow';

const ACCEPTED = '.mp4,.mov,.webm,.m4v';

export default function UploadVideoNode({ id, data, selected }: NodeProps<UploadVideoNodeData>) {
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

      for (let i = 0; i < 150; i++) {
        if (assembly.ok === 'ASSEMBLY_COMPLETED') break;
        if (assembly.error) throw new Error(assembly.error);
        await new Promise(r => setTimeout(r, 500));
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
      updateNodeData(id, { videoUrl: url });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <NodeShell id={id} title="Upload Video" icon={<Video />} accentColor="#F59E0B" selected={selected} minWidth={260}>
      <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

      {data.videoUrl ? (
        <div className="relative">
          <video
            src={data.videoUrl}
            controls
            className="w-full rounded-lg nodrag"
            style={{ maxHeight: 150 }}
          />
          <button
            onClick={() => updateNodeData(id, { videoUrl: undefined })}
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
          onMouseEnter={e => { if (!uploading) e.currentTarget.style.borderColor = '#F59E0B'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; }}
        >
          {uploading
            ? <Loader2 size={18} style={{ color: '#F59E0B' }} className="animate-spin" />
            : <Upload size={18} style={{ color: '#555' }} />}
          <span style={{ fontSize: '11px', color: '#666' }}>
            {uploading ? 'Uploading...' : 'Click to upload video'}
          </span>
          <span style={{ fontSize: '10px', color: '#444' }}>mp4, mov, webm, m4v</span>
        </button>
      )}

      {error && <p style={{ fontSize: '10px', color: '#EF4444', marginTop: 4 }}>{error}</p>}

      <Handle type="source" position={Position.Right} id="output" style={{ right: -5, top: '50%' }} />
      <span style={{
        position: 'absolute', right: 10, top: '50%',
        transform: 'translateY(-50%)',
        fontSize: '9px', color: '#555', pointerEvents: 'none',
      }}>video</span>
    </NodeShell>
  );
}
