import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workflow = await prisma.workflow.findFirst({ where: { id: params.id, userId } });
  if (!workflow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ workflow });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await prisma.workflow.findFirst({ where: { id: params.id, userId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.workflow.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
