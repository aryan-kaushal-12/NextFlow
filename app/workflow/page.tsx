'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { Plus, Workflow, Clock, Trash2 } from 'lucide-react';

interface WorkflowItem {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
}

export default function WorkflowListPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/workflow/list')
      .then(r => r.json())
      .then(d => setWorkflows(d.workflows || []))
      .finally(() => setLoading(false));
  }, []);

  async function createNew() {
    const res = await fetch('/api/workflow/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Untitled Workflow', nodes: [], edges: [] }),
    });
    const data = await res.json();
    router.push(`/workflow/${data.workflow.id}`);
  }

  async function deleteWorkflow(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this workflow?')) return;
    await fetch(`/api/workflow/${id}`, { method: 'DELETE' });
    setWorkflows(prev => prev.filter(w => w.id !== id));
  }

  return (
    <div className="min-h-screen" style={{ background: '#0A0A0A' }}>
      {/* Top bar */}
      <header style={{ borderBottom: '1px solid #272727', background: '#111111' }} className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg" style={{ background: 'linear-gradient(135deg,#A855F7,#7C3AED)' }} />
          <span className="font-semibold" style={{ color: '#F0F0F0' }}>NextFlow</span>
        </div>
        <UserButton afterSignOutUrl="/sign-in" />
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: '#F0F0F0' }}>My Workflows</h1>
            <p style={{ color: '#999999', fontSize: '14px', marginTop: 4 }}>Build and manage your LLM workflows</p>
          </div>
          <button
            onClick={createNew}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all"
            style={{ background: '#A855F7', color: '#fff' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#9333EA')}
            onMouseLeave={e => (e.currentTarget.style.background = '#A855F7')}
          >
            <Plus size={16} />
            New Workflow
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-xl h-32 animate-pulse" style={{ background: '#161616' }} />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#161616' }}>
              <Workflow size={28} style={{ color: '#555' }} />
            </div>
            <p style={{ color: '#999999' }}>No workflows yet</p>
            <button
              onClick={createNew}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: '#A855F7', color: '#fff' }}
            >
              Create your first workflow
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* "New workflow" card */}
            <button
              onClick={createNew}
              className="group rounded-xl border flex flex-col items-center justify-center gap-2 h-32 transition-all"
              style={{ background: '#111111', border: '1px dashed #333', color: '#666' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#A855F7'; e.currentTarget.style.color = '#A855F7'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#666'; }}
            >
              <Plus size={20} />
              <span className="text-sm">New Workflow</span>
            </button>

            {workflows.map(wf => (
              <button
                key={wf.id}
                onClick={() => router.push(`/workflow/${wf.id}`)}
                className="group relative rounded-xl text-left p-5 transition-all"
                style={{ background: '#161616', border: '1px solid #272727' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#272727'; }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#1E1E1E' }}>
                    <Workflow size={16} style={{ color: '#A855F7' }} />
                  </div>
                  <button
                    onClick={(e) => deleteWorkflow(wf.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all"
                    style={{ color: '#666' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.background = '#1E1E1E'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="font-medium text-sm mb-1" style={{ color: '#F0F0F0' }}>{wf.name}</p>
                <div className="flex items-center gap-1" style={{ color: '#555', fontSize: '11px' }}>
                  <Clock size={10} />
                  <span>{new Date(wf.updatedAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
