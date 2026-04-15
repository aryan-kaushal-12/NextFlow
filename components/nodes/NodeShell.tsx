'use client';

import React from 'react';
import { useWorkflowStore } from '@/store/workflowStore';

interface NodeShellProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  children: React.ReactNode;
  selected?: boolean;
  minWidth?: number;
}

export default function NodeShell({ id, title, icon, accentColor, children, selected, minWidth = 240 }: NodeShellProps) {
  const { runningNodeIds } = useWorkflowStore();
  const isRunning = runningNodeIds.includes(id);

  return (
    <div
      className={`workflow-node ${selected ? 'selected' : ''} ${isRunning ? 'running' : ''}`}
      style={{ minWidth, position: 'relative' }}
    >
      {/* Running indicator bar */}
      {isRunning && (
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
            borderRadius: '12px 12px 0 0',
            animation: 'shimmer 1.5s infinite',
          }}
        />
      )}

      {/* Header */}
      <div className="node-header">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          style={{ background: `${accentColor}20` }}
        >
          {React.cloneElement(icon as React.ReactElement, { size: 13, style: { color: accentColor } })}
        </div>
        <span style={{ fontSize: '12px', fontWeight: 500, color: '#E0E0E0', flex: 1 }}>{title}</span>
        {isRunning && (
          <span style={{ fontSize: '10px', color: accentColor }} className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: accentColor, animation: 'pulse 1s infinite' }} />
            Running
          </span>
        )}
      </div>

      {/* Body */}
      <div className="node-body">{children}</div>

      <style>{`@keyframes shimmer { 0%{background-position:-200%} 100%{background-position:200%} }`}</style>
    </div>
  );
}

// Shared label style
export function InputLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>{children}</label>;
}

// Handle label
export function HandleLabel({ children, side }: { children: React.ReactNode; side: 'left' | 'right' }) {
  return (
    <span style={{
      position: 'absolute',
      fontSize: '9px', color: '#555',
      top: '50%', transform: 'translateY(-50%)',
      ...(side === 'left' ? { left: 14 } : { right: 14 }),
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}
