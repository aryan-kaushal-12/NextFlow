'use client';

import { useEffect, useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import {
  Clock, ChevronDown, ChevronRight,
  CheckCircle, XCircle, Loader2,
  RotateCcw, AlertCircle,
} from 'lucide-react';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
    SUCCESS: { color: '#22C55E', bg: 'rgba(34,197,94,0.1)', icon: <CheckCircle size={10} />, label: 'Success' },
    FAILED:  { color: '#EF4444', bg: 'rgba(239,68,68,0.1)',  icon: <XCircle size={10} />, label: 'Failed' },
    PARTIAL: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', icon: <AlertCircle size={10} />, label: 'Partial' },
    RUNNING: { color: '#A855F7', bg: 'rgba(168,85,247,0.1)', icon: <Loader2 size={10} className="animate-spin" />, label: 'Running' },
    SKIPPED: { color: '#94A3B8', bg: 'rgba(148,163,184,0.12)', icon: <AlertCircle size={10} />, label: 'Skipped' },
  };
  const s = map[status] || map.RUNNING;
  return (
    <span
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ color: s.color, background: s.bg }}
    >
      {s.icon}{s.label}
    </span>
  );
}

function NodeExecutionRow({ exec }: { exec: {
  nodeId: string; nodeType: string; nodeLabel?: string | null;
  status: string; duration?: number | null; error?: string | null;
  outputs?: unknown; createdAt: string;
}}) {
  const outputs = exec.outputs as Record<string, string> | null;
  const outputStr = outputs?.output
    ? outputs.output.length > 60 ? outputs.output.slice(0, 60) + '…' : outputs.output
    : null;

  return (
    <div className="pl-4 border-l ml-2" style={{ borderColor: '#272727' }}>
      <div className="flex items-center gap-1.5 py-1">
        <div className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            background:
              exec.status === 'SUCCESS'
                ? '#22C55E'
                : exec.status === 'FAILED'
                  ? '#EF4444'
                  : exec.status === 'SKIPPED'
                    ? '#94A3B8'
                    : '#A855F7',
          }} />
        <span style={{ fontSize: '11px', color: '#C0C0C0', flex: 1 }}>{exec.nodeLabel || exec.nodeType}</span>
        {exec.duration && <span style={{ fontSize: '10px', color: '#555' }}>{(exec.duration / 1000).toFixed(1)}s</span>}
        <StatusBadge status={exec.status} />
      </div>
      {outputStr && (
        <p style={{ fontSize: '10px', color: '#666', paddingLeft: 14, paddingBottom: 4, fontFamily: 'monospace' }}>
          ↳ {outputStr}
        </p>
      )}
      {exec.error && (
        <p style={{ fontSize: '10px', color: '#EF4444', paddingLeft: 14, paddingBottom: 4 }}>
          ✗ {exec.error}
        </p>
      )}
    </div>
  );
}

interface RunItem {
  id: string;
  workflowId: string;
  status: string;
  scope: string;
  duration?: number | null;
  createdAt: string;
  nodeExecutions?: Array<{
    id: string; nodeId: string; nodeType: string; nodeLabel?: string | null;
    status: string; duration?: number | null; error?: string | null;
    outputs?: unknown; createdAt: string;
  }>;
}

function RunRow({ run }: { run: RunItem }) {
  const [expanded, setExpanded] = useState(false);

  const scopeLabel = run.scope === 'FULL' ? 'Full Workflow' : run.scope === 'PARTIAL' ? 'Selected Nodes' : 'Single Node';
  const date = new Date(run.createdAt);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div className="border-b" style={{ borderColor: '#1E1E1E' }}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[#1A1A1A]"
      >
        <div className="mt-0.5" style={{ color: '#555' }}>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span style={{ fontSize: '11px', color: '#F0F0F0', fontWeight: 500 }}>
              {dateStr} {timeStr}
            </span>
            <StatusBadge status={run.status} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span style={{ fontSize: '10px', color: '#555' }}>{scopeLabel}</span>
            {run.duration && (
              <span style={{ fontSize: '10px', color: '#555' }}>· {(run.duration / 1000).toFixed(1)}s</span>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="pb-2 px-2">
          {(run.nodeExecutions || []).length === 0 ? (
            <p style={{ fontSize: '10px', color: '#555', paddingLeft: 16 }}>No node details yet...</p>
          ) : (
            (run.nodeExecutions || []).map(exec => (
              <NodeExecutionRow key={exec.id} exec={exec} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function RightSidebar() {
  const { workflowId, runHistory, setRunHistory, setLoadingHistory, loadingHistory } = useWorkflowStore();

  useEffect(() => {
    if (!workflowId) return;
    setLoadingHistory(true);
    fetch(`/api/workflow/history?workflowId=${workflowId}`)
      .then(r => r.json())
      .then(d => setRunHistory(d.runs || []))
      .finally(() => setLoadingHistory(false));
  }, [workflowId]);

  return (
    <aside
      className="flex flex-col shrink-0"
      style={{ width: 260, background: '#111111', borderLeft: '1px solid #272727', overflowY: 'auto' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b" style={{ borderColor: '#272727' }}>
        <Clock size={13} style={{ color: '#666' }} />
        <span style={{ fontSize: '12px', fontWeight: 500, color: '#C0C0C0' }}>Run History</span>
        {loadingHistory && <Loader2 size={11} className="animate-spin ml-auto" style={{ color: '#555' }} />}
      </div>

      {/* Runs */}
      <div className="flex-1">
        {runHistory.length === 0 && !loadingHistory ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <RotateCcw size={20} style={{ color: '#333' }} />
            <p style={{ fontSize: '11px', color: '#555' }}>No runs yet</p>
            <p style={{ fontSize: '10px', color: '#444', textAlign: 'center', padding: '0 16px' }}>
              Click Run to execute your workflow
            </p>
          </div>
        ) : (
          runHistory.map(run => <RunRow key={run.id} run={run} />)
        )}
      </div>
    </aside>
  );
}
