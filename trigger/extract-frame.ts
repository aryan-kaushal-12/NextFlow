import { task, logger } from '@trigger.dev/sdk/v3';
import { extractFrameViaTransloadit } from '@/lib/transloadit';
import prisma from '@/lib/prisma';

interface ExtractFramePayload {
  executionId: string;
  videoUrl: string;
  timestamp: string;
}

export const extractFrameTask = task({
  id: 'extract-frame',
  maxDuration: 180,
  run: async (payload: ExtractFramePayload) => {
    const { executionId, videoUrl, timestamp } = payload;
    const startTime = Date.now();

    logger.info('Extract frame task executing', { videoUrl, timestamp });

    try {
      await prisma.nodeExecution.update({
        where: { id: executionId },
        data: { status: 'RUNNING', inputs: JSON.parse(JSON.stringify(payload)) },
      });

      const outputUrl = await extractFrameViaTransloadit(videoUrl, timestamp || '00:00:00');

      const duration = Date.now() - startTime;
      await prisma.nodeExecution.update({
        where: { id: executionId },
        data: { status: 'SUCCESS', outputs: { output: outputUrl }, duration },
      });

      logger.info('Extract frame completed', { outputUrl, duration });
      return { output: outputUrl };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      await prisma.nodeExecution.update({
        where: { id: executionId },
        data: { status: 'FAILED', error: message, duration },
      });
      throw error;
    }
  },
});
