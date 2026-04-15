import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const workflowId = searchParams.get('workflowId');

  const runs = await prisma.workflowRun.findMany({
    where: { userId, ...(workflowId ? { workflowId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { nodeExecutions: { orderBy: { createdAt: 'asc' } } },
  });
  return NextResponse.json({ runs });
}
