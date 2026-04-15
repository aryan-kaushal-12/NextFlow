import { task, logger } from '@trigger.dev/sdk/v3';
import { llmNodeTask } from './llm-node';
import { cropImageTask } from './crop-image';
import { extractFrameTask } from './extract-frame';
import { topologicalLevels, resolveInputs, expandWithAncestors } from '@/lib/execution-engine';
import { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import prisma from '@/lib/prisma';

interface OrchestratorPayload {
  runId: string;
  workflowId: string;
  userId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  scope: 'full' | 'partial' | 'single';
  selectedNodeIds?: string[];
}

export const workflowOrchestrator = task({
  id: 'workflow-orchestrator',
  maxDuration: 600,
  run: async (payload: OrchestratorPayload) => {
    const { runId, nodes, edges, scope, selectedNodeIds } = payload;
    const startTime = Date.now();

    const activeNodeIds =
      scope === 'full' || !selectedNodeIds?.length
        ? null
        : expandWithAncestors(selectedNodeIds, edges);

    logger.info('Orchestrator starting', {
      runId,
      nodeCount: nodes.length,
      scope,
      activeCount: activeNodeIds?.length,
    });

    // Execution context: nodeId → handleId → value
    const ctx: Record<string, Record<string, string>> = {};

    // Pre-populate static node outputs (Text, UploadImage, UploadVideo)
    for (const node of nodes) {
      const data = node.data as unknown as Record<string, unknown>;
      if (node.type === 'textNode') {
        ctx[node.id] = { output: String(data.text || '') };
      } else if (node.type === 'uploadImageNode' && data.imageUrl) {
        ctx[node.id] = { output: String(data.imageUrl) };
      } else if (node.type === 'uploadVideoNode' && data.videoUrl) {
        ctx[node.id] = { output: String(data.videoUrl) };
      }
    }

    // Nodes that need execution (non-static types)
    const executableTypes = ['llmNode', 'cropImageNode', 'extractFrameNode'];
    // Get execution levels (for parallel execution)
    const levels = topologicalLevels(
      nodes,
      edges,
      activeNodeIds ?? undefined
    );

    const subgraphEdges = activeNodeIds
      ? edges.filter(e => activeNodeIds.includes(e.source) && activeNodeIds.includes(e.target))
      : edges;

    const blockedNodeIds = new Set<string>();
    let executableSuccess = 0;
    let executableFailed = 0;

    for (const level of levels) {
      // Filter to only executable nodes in this level
      const executableInLevel = level.filter(n => executableTypes.includes(n.type || ''));
      if (executableInLevel.length === 0) continue;

      const toRun: typeof executableInLevel = [];
      const toSkip: typeof executableInLevel = [];

      for (const node of executableInLevel) {
        const parents = subgraphEdges.filter(e => e.target === node.id).map(e => e.source);
        if (parents.some(p => blockedNodeIds.has(p))) {
          toSkip.push(node);
        } else {
          toRun.push(node);
        }
      }

      for (const node of toSkip) {
        await prisma.nodeExecution.create({
          data: {
            runId,
            nodeId: node.id,
            nodeType: node.type || '',
            nodeLabel: ((node.data as unknown) as Record<string, unknown>).label as string || node.type,
            status: 'SKIPPED',
            error: 'Upstream node failed or was skipped',
            duration: 0,
          },
        });
        blockedNodeIds.add(node.id);
        logger.info('Skipping node (blocked upstream)', { nodeId: node.id });
      }

      if (toRun.length === 0) continue;

      logger.info('Executing level', { count: toRun.length, nodeIds: toRun.map(n => n.id) });

      const execRecords = await Promise.all(
        toRun.map(node =>
          prisma.nodeExecution.create({
            data: {
              runId,
              nodeId: node.id,
              nodeType: node.type || '',
              nodeLabel: ((node.data as unknown) as Record<string, unknown>).label as string || node.type,
              status: 'RUNNING',
            },
          })
        )
      );

      const levelResults = await Promise.allSettled(
        toRun.map(async (node, idx) => {
          const executionId = execRecords[idx].id;
          const inputs = resolveInputs(node.id, node.type || '', edges, nodes, ctx);
          const data = node.data as unknown as Record<string, unknown>;

          let result: Record<string, string>;

          if (node.type === 'llmNode') {
            const run = await llmNodeTask.triggerAndWait({
              executionId,
              model: String(data.model || 'openai:gpt-4o-mini'),
              systemPrompt: (inputs.system_prompt as string) || undefined,
              userMessage: String(inputs.user_message || ''),
              imageUrls: Array.isArray(inputs.images) ? inputs.images : inputs.images ? [inputs.images] : [],
            });
            if (!run.ok) throw new Error(run.error ? String(run.error) : 'LLM task failed');
            result = { output: run.output.output };
          } else if (node.type === 'cropImageNode') {
            const run = await cropImageTask.triggerAndWait({
              executionId,
              imageUrl: String(inputs.image_url || ''),
              x_percent: Number(inputs.x_percent ?? data.x_percent ?? 0),
              y_percent: Number(inputs.y_percent ?? data.y_percent ?? 0),
              width_percent: Number(inputs.width_percent ?? data.width_percent ?? 100),
              height_percent: Number(inputs.height_percent ?? data.height_percent ?? 100),
            });
            if (!run.ok) throw new Error(run.error ? String(run.error) : 'Crop task failed');
            result = { output: run.output.output };
          } else if (node.type === 'extractFrameNode') {
            const run = await extractFrameTask.triggerAndWait({
              executionId,
              videoUrl: String(inputs.video_url || ''),
              timestamp: String(inputs.timestamp ?? data.timestamp ?? '00:00:00'),
            });
            if (!run.ok) throw new Error(run.error ? String(run.error) : 'Extract frame task failed');
            result = { output: run.output.output };
          } else {
            throw new Error(`Unknown node type: ${node.type}`);
          }

          ctx[node.id] = result;
          return { nodeId: node.id, result };
        })
      );

      for (let i = 0; i < levelResults.length; i++) {
        const res = levelResults[i];
        const node = toRun[i];
        if (res.status === 'rejected') {
          executableFailed += 1;
          blockedNodeIds.add(node.id);
          logger.error('Node execution failed', { nodeId: node.id, error: res.reason });
        } else {
          executableSuccess += 1;
        }
      }
    }

    // Update WorkflowRun with final status
    const duration = Date.now() - startTime;
    let finalStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED' = 'SUCCESS';
    if (executableFailed > 0 && executableSuccess > 0) finalStatus = 'PARTIAL';
    else if (executableFailed > 0) finalStatus = 'FAILED';

    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: finalStatus, duration },
    });

    logger.info('Orchestrator completed', { runId, status: finalStatus, duration });
    return { runId, status: finalStatus, duration };
  },
});
