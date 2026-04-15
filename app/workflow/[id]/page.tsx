import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import WorkflowEditor from '@/components/WorkflowEditor';

export default async function WorkflowPage({ params }: { params: { id: string } }) {
  const { userId } = auth();
  if (!userId) redirect('/sign-in');

  const workflow = await prisma.workflow.findFirst({
    where: { id: params.id, userId },
  });
  if (!workflow) notFound();

  return (
    <WorkflowEditor
      workflowId={workflow.id}
      workflowName={workflow.name}
      initialNodes={workflow.nodes as any[]}
      initialEdges={workflow.edges as any[]}
      initialViewport={workflow.viewport as any}
    />
  );
}
