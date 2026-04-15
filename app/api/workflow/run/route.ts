import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { workflowOrchestrator } from '@/trigger/orchestrator';

const runSchema = z
  .object({
    workflowId: z.string(),
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
    scope: z.enum(['full', 'partial', 'single']).default('full'),
    selectedNodeIds: z.array(z.string()).optional(),
  })
  .refine(
    data => data.scope === 'full' || (data.selectedNodeIds?.length ?? 0) > 0,
    { message: 'selectedNodeIds required for partial or single runs', path: ['selectedNodeIds'] }
  );

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { workflowId, nodes, edges, scope, selectedNodeIds } = parsed.data;

  // Create WorkflowRun record
  const run = await prisma.workflowRun.create({
    data: {
      workflowId,
      userId,
      status: 'RUNNING',
      scope: scope.toUpperCase() as 'FULL' | 'PARTIAL' | 'SINGLE',
      selectedNodes: selectedNodeIds || [],
    },
  });

  // Trigger the orchestrator Trigger.dev task
  const triggerHandle = await workflowOrchestrator.trigger({
    runId: run.id,
    workflowId,
    userId,
    nodes,
    edges,
    scope,
    selectedNodeIds,
  });

  // Save trigger ID to run
  await prisma.workflowRun.update({
    where: { id: run.id },
    data: { triggerId: triggerHandle.id },
  });

  return NextResponse.json({ runId: run.id, triggerId: triggerHandle.id });
}
