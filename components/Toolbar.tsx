'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import {
  Play, Square, RotateCcw, RotateCw, Download, Upload,
  ChevronLeft, PanelLeft, PanelRight, Save, Loader2,
  ChevronDown, Focus, PlayCircle,
} from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { expandWithAncestors } from '@/lib/execution-engine';

export default function Toolbar() {
  const router = useRouter();
  const {
    workflowId, workflowName, setWorkflowName,
    nodes, edges,
    undo, redo,
    isRunning, setIsRunning, setRunningNodeIds,
    clearNodeOutputs, setActiveRunId,
    prependRun, updateRun,
    leftSidebarOpen, rightSidebarOpen,
    toggleLeftSidebar, toggleRightSidebar,
    updateNodeData,
    selectedNodeIds,
    requestFitView,
  } = useWorkflowStore();

  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function runWorkflow(scope: 'full' | 'partial' | 'single' = 'full') {
    if (!workflowId || isRunning) return;

    let selectedForRun: string[] | undefined;
    if (scope === 'single') {
      if (selectedNodeIds.length !== 1) {
        alert('Select exactly one node on the canvas to run a single node.');
        return;
      }
      selectedForRun = selectedNodeIds;
    } else if (scope === 'partial') {
      if (selectedNodeIds.length < 2) {
        alert('Select two or more nodes for a partial run, or use “Run single node” with one node selected.');
        return;
      }
      selectedForRun = selectedNodeIds;
    }

    const executableTypes = ['llmNode', 'cropImageNode', 'extractFrameNode'];
    const expandedSet =
      scope === 'full'
        ? null
        : new Set(expandWithAncestors(selectedForRun!, edges));

    const executableInRun = nodes.filter(
      n =>
        executableTypes.includes(n.type || '') &&
        (scope === 'full' || (expandedSet?.has(n.id) ?? false))
    );

    if (executableInRun.length === 0) {
      alert(
        scope === 'full'
          ? 'No executable nodes (LLM, Crop Image, Extract Frame) found in workflow.'
          : 'No executable nodes in the subgraph for your selection. Include at least one LLM, Crop, or Extract Frame node (or select upstream of one).'
      );
      return;
    }

    setIsRunning(true);
    clearNodeOutputs();
    // Clear result/error from previous run so nodes don't show stale state
    for (const n of executableInRun) {
      updateNodeData(n.id, { result: undefined, error: undefined });
    }
    setRunningNodeIds(executableInRun.map(n => n.id));
    setRunMenuOpen(false);

    const runEntry = {
      id: 'temp-' + Date.now(),
      workflowId: workflowId!,
      status: 'RUNNING',
      scope: scope.toUpperCase(),
      duration: null,
      createdAt: new Date().toISOString(),
    };
    prependRun(runEntry);

    try {
      const res = await fetch('/api/workflow/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          nodes,
          edges,
          scope,
          ...(selectedForRun?.length ? { selectedNodeIds: selectedForRun } : {}),
        }),
      });
      const data = await res.json();
      const runId = data.runId;
      setActiveRunId(runId);

      // Replace temp run with real run
      updateRun(runEntry.id, { id: runId, status: 'RUNNING' });

      const pollMs = 450;
      const pollOnce = async (): Promise<boolean> => {
        try {
          const statusRes = await fetch(`/api/workflow/status?runId=${runId}`);
          const statusData = await statusRes.json();
          const run = statusData.run;

          if (!run) return false;

          for (const exec of run.nodeExecutions || []) {
            if (exec.status === 'SUCCESS' && exec.outputs) {
              const outs = exec.outputs as Record<string, string>;
              updateNodeData(exec.nodeId, { outputs: outs, isRunning: false });
              if (exec.nodeType === 'llmNode') updateNodeData(exec.nodeId, { result: outs.output });
              if (exec.nodeType === 'cropImageNode') updateNodeData(exec.nodeId, { result: outs.output });
              if (exec.nodeType === 'extractFrameNode') updateNodeData(exec.nodeId, { result: outs.output });
            }
            if (exec.status === 'FAILED') {
              updateNodeData(exec.nodeId, { error: exec.error || 'Failed', isRunning: false });
            }
          }

          if (run.status !== 'RUNNING') {
            setIsRunning(false);
            setRunningNodeIds([]);
            updateRun(runId, { status: run.status, duration: run.duration, nodeExecutions: run.nodeExecutions });
            return true;
          }
        } catch {
          /* keep polling until run finishes or user stops */
        }
        return false;
      };

      await pollOnce();
      pollRef.current = setInterval(async () => {
        const done = await pollOnce();
        if (done && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, pollMs);
    } catch (err) {
      setIsRunning(false);
      setRunningNodeIds([]);
    }
  }

  function stopRun() {
    if (pollRef.current) clearInterval(pollRef.current);
    setIsRunning(false);
    setRunningNodeIds([]);
  }

  async function saveWorkflow() {
    if (!workflowId) return;
    setSaving(true);
    const viewport = useWorkflowStore.getState().viewport;
    await fetch('/api/workflow/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId,
        name: workflowName,
        nodes,
        edges,
        ...(viewport ? { viewport } : {}),
      }),
    });
    setSaving(false);
  }

  function exportWorkflow() {
    const json = JSON.stringify({ name: workflowName, nodes, edges }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflowName.replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importWorkflow() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.nodes) useWorkflowStore.getState().setNodes(data.nodes);
      if (data.edges) useWorkflowStore.getState().setEdges(data.edges);
      if (data.name) setWorkflowName(data.name);
    };
    input.click();
  }

  const iconBtn =
    'toolbar-icon-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[#1E1E1E]';

  return (
    <header
      className="workflow-toolbar flex min-h-[48px] items-center gap-2 px-3 py-2 shrink-0"
      style={{ background: '#111111', borderBottom: '1px solid #272727' }}
    >
      {/* Logo + back */}
      <button onClick={() => router.push('/workflow')} className="flex items-center gap-1.5 px-2 py-1 rounded-lg mr-1 transition-colors hover:bg-[#1E1E1E]">
        <div className="w-5 h-5 rounded-md" style={{ background: 'linear-gradient(135deg,#A855F7,#7C3AED)' }} />
        <ChevronLeft size={14} style={{ color: '#666' }} />
      </button>

      {/* Workflow name */}
      {editingName ? (
        <input
          autoFocus
          className="px-2 py-0.5 rounded text-sm font-medium"
          style={{ background: '#1E1E1E', border: '1px solid #A855F7', color: '#F0F0F0', minWidth: 160 }}
          value={workflowName}
          onChange={e => setWorkflowName(e.target.value)}
          onBlur={() => { setEditingName(false); saveWorkflow(); }}
          onKeyDown={e => { if (e.key === 'Enter') { setEditingName(false); saveWorkflow(); } }}
        />
      ) : (
        <button
          onClick={() => setEditingName(true)}
          className="px-2 py-0.5 rounded text-sm font-medium truncate max-w-[180px] transition-colors hover:bg-[#1E1E1E]"
          style={{ color: '#F0F0F0' }}
        >
          {workflowName}
        </button>
      )}

      <div className="flex-1 min-w-0" />

      {/* Right cluster: single row, 32px (h-8) controls for alignment */}
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={toggleLeftSidebar} className={iconBtn} title="Left sidebar">
          <PanelLeft size={16} style={{ color: leftSidebarOpen ? '#A855F7' : '#888' }} />
        </button>
        <button type="button" onClick={toggleRightSidebar} className={iconBtn} title="Run history">
          <PanelRight size={16} style={{ color: rightSidebarOpen ? '#A855F7' : '#888' }} />
        </button>

        <div className="mx-1 h-5 w-px shrink-0 self-center bg-[#272727]" aria-hidden />

        <button type="button" onClick={undo} className={iconBtn} title="Undo (⌘Z)">
          <RotateCcw size={15} style={{ color: '#888' }} />
        </button>
        <button type="button" onClick={redo} className={iconBtn} title="Redo (⌘⇧Z)">
          <RotateCw size={15} style={{ color: '#888' }} />
        </button>

        <div className="mx-1 h-5 w-px shrink-0 self-center bg-[#272727]" aria-hidden />

        <button type="button" onClick={importWorkflow} className={iconBtn} title="Import JSON">
          <Upload size={15} style={{ color: '#888' }} />
        </button>
        <button type="button" onClick={exportWorkflow} className={iconBtn} title="Export JSON">
          <Download size={15} style={{ color: '#888' }} />
        </button>
        <button type="button" onClick={saveWorkflow} className={iconBtn} title="Save">
          {saving ? <Loader2 size={15} className="animate-spin text-accent-purple" /> : <Save size={15} style={{ color: '#888' }} />}
        </button>

        <div className="mx-1 h-5 w-px shrink-0 self-center bg-[#272727]" aria-hidden />

        <button type="button" onClick={() => requestFitView()} className={iconBtn} title="Fit view">
          <Focus size={15} style={{ color: '#888' }} />
        </button>

        {/* Run / Stop — same height as icon row (h-8) */}
        {isRunning ? (
          <button
            type="button"
            onClick={stopRun}
            className="ml-1 flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#EF4444] bg-[#1E1E1E] px-3 text-xs font-medium text-[#EF4444] transition-colors hover:bg-[#252525]"
          >
            <Square size={14} />
            Stop
          </button>
        ) : (
          <div className="relative ml-1 flex h-8 shrink-0 overflow-hidden rounded-lg">
            <button
              type="button"
              onClick={() => runWorkflow('full')}
              className="flex h-8 items-center gap-1.5 bg-[#A855F7] pl-3 pr-2 text-xs font-medium text-white transition-colors hover:bg-[#9333EA]"
            >
              <Play size={14} />
              Run
            </button>
            <button
              type="button"
              onClick={() => setRunMenuOpen(v => !v)}
              className="flex h-8 w-8 items-center justify-center border-l border-white/25 bg-[#A855F7] text-white transition-colors hover:bg-[#9333EA]"
              aria-expanded={runMenuOpen}
              aria-haspopup="menu"
              title="More run options"
            >
              <ChevronDown size={15} />
            </button>
          {runMenuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default"
                aria-label="Close menu"
                onClick={() => setRunMenuOpen(false)}
              />
              <div
                className="absolute right-0 top-full mt-1 z-50 py-1 rounded-lg shadow-lg min-w-[200px]"
                style={{ background: '#1A1A1A', border: '1px solid #272727' }}
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[#252525]"
                  style={{ color: '#E0E0E0' }}
                  onClick={() => runWorkflow('full')}
                >
                  <Play size={12} style={{ color: '#A855F7' }} />
                  Run full workflow
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[#252525]"
                  style={{ color: '#E0E0E0' }}
                  onClick={() => runWorkflow('partial')}
                >
                  <PlayCircle size={12} style={{ color: '#A855F7' }} />
                  Run selected nodes (2+)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[#252525]"
                  style={{ color: '#E0E0E0' }}
                  onClick={() => runWorkflow('single')}
                >
                  <PlayCircle size={12} style={{ color: '#22C55E' }} />
                  Run single node
                </button>
              </div>
            </>
          )}
          </div>
        )}

        <div className="ml-2 flex h-8 items-center [&_.cl-userButtonTrigger]:h-8 [&_.cl-userButtonTrigger]:w-8 [&_.cl-userButtonBox]:h-8 [&_.cl-userButtonBox]:w-8">
          <UserButton
            afterSignOutUrl="/sign-in"
            appearance={{
              elements: {
                userButtonAvatarBox: 'h-8 w-8 ring-1 ring-[#272727]',
                userButtonTrigger: 'h-8 w-8 rounded-lg focus:shadow-none',
              },
            }}
          />
        </div>
      </div>
    </header>
  );
}
