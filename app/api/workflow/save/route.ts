import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';

const saveSchema = z.object({
  workflowId: z.string().optional(),
  name: z.string().optional(),
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  viewport: z.any().optional(),
});

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { workflowId, name, nodes, edges, viewport } = parsed.data;

  if (workflowId) {
    // Update existing
    const existing = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updated = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        name: name || existing.name,
        nodes,
        edges,
        ...(viewport !== undefined ? { viewport } : {}),
      },
    });
    return NextResponse.json({ workflow: updated });
  } else {
    // Create new
    const workflow = await prisma.workflow.create({
      data: { userId, name: name || 'Untitled Workflow', nodes, edges, viewport },
    });
    return NextResponse.json({ workflow });
  }
}
