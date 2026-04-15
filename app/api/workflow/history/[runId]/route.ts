import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { runId: string } }) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const run = await prisma.workflowRun.findFirst({
    where: { id: params.runId, userId },
    include: { nodeExecutions: { orderBy: { createdAt: 'asc' } } },
  });
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ run });
}
